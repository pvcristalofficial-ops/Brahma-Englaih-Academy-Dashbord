<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Audit;
use App\Auth;
use App\Db;
use App\Enums;
use App\HttpException;
use App\Request;
use App\Services\EnquiryService as E;
use App\Settings;
use App\Validator;

final class FollowupController
{
    /**
     * Today's follow-up list.
     *   today   : scheduled for today
     *   overdue : scheduled earlier and not done -> automatically carried into today's list
     *   auto    : no follow-up date was set and the enquiry has been untouched for N days (default 7)
     *   upcoming: next 7 days (preview, not part of "today")
     */
    public static function due(Request $req): array
    {
        $today = Validator::today();
        $stale = Settings::staleDays();
        $due = E::dueExpr();
        $scope = $req->q('scope', Auth::isAdmin() ? 'all' : 'mine');
        $filter = $req->q('filter', 'all');
        if (!in_array($filter, ['all', 'today', 'overdue', 'auto', 'upcoming'], true)) {
            $filter = 'all';
        }

        [$base, $bp] = self::scope($scope);
        $weekAhead = (new \DateTimeImmutable($today))->modify('+7 days')->format('Y-m-d');
        $counts = self::counts($today, $stale, $base, $bp);

        $conds = match ($filter) {
            'today'    => ["$due = ?", [$stale, $today]],
            'overdue'  => ["$due < ?", [$stale, $today]],
            'auto'     => ["e.next_follow_up_date IS NULL AND $due <= ?", [$stale, $today]],
            'upcoming' => ["$due > ? AND $due <= ?", [$stale, $today, $stale, $weekAhead]],
            default    => ["$due <= ?", [$stale, $today]],
        };

        $page = $req->qInt('page', 1, 1, 100000);
        $per = $req->qInt('per_page', 100, 5, 200);
        $offset = ($page - 1) * $per;
        $total = (int) Db::val("SELECT COUNT(*) FROM enquiries e WHERE $base AND {$conds[0]}", [...$bp, ...$conds[1]]);

        $order = $filter === 'upcoming'
            ? "$due ASC, e.next_follow_up_time IS NULL, e.next_follow_up_time ASC, e.id ASC"
            : "CASE WHEN $due = ? THEN 0 ELSE 1 END, FIELD(e.interest_level,'hot','warm','cold'),
               e.next_follow_up_time IS NULL, e.next_follow_up_time ASC, $due ASC, e.id ASC";
        $orderParams = $filter === 'upcoming' ? [$stale] : [$stale, $today, $stale];
        $rows = Db::all(
            E::BASE_SELECT . " WHERE $base AND {$conds[0]} ORDER BY $order LIMIT $per OFFSET $offset",
            [...$bp, ...$conds[1], ...$orderParams]
        );

        return [
            'data' => array_map(static fn ($r) => E::present($r, $today, $stale), $rows),
            'counts' => $counts,
            'meta' => ['page' => $page, 'per_page' => $per, 'total' => $total, 'pages' => (int) ceil($total / $per), 'stale_days' => $stale, 'today' => $today],
        ];
    }

    /** WHERE fragment (+params) selecting the open, non-archived enquiries a user is responsible for. */
    public static function scope(?string $scope): array
    {
        $base = "e.is_archived = 0 AND e.status IN ('new','follow_up','demo_scheduled')";
        $bp = [];
        if ($scope === 'mine') {
            $base .= ' AND (e.assigned_to = ? OR e.assigned_to IS NULL)';
            $bp[] = Auth::id();
        } elseif ($scope !== null && ctype_digit($scope)) {
            $base .= ' AND e.assigned_to = ?';
            $bp[] = (int) $scope;
        }
        return [$base, $bp];
    }

    public static function counts(string $today, int $stale, string $base, array $bp): array
    {
        $due = E::dueExpr();
        $week = (new \DateTimeImmutable($today))->modify('+7 days')->format('Y-m-d');
        $c = Db::one(
            "SELECT
               COALESCE(SUM(t.d = ?), 0)                        AS today_cnt,
               COALESCE(SUM(t.d < ?), 0)                        AS overdue_cnt,
               COALESCE(SUM(t.auto_flag = 1 AND t.d <= ?), 0)   AS auto_cnt,
               COALESCE(SUM(t.d > ? AND t.d <= ?), 0)           AS upcoming_cnt
             FROM (SELECT $due AS d, (e.next_follow_up_date IS NULL) AS auto_flag FROM enquiries e WHERE $base) t",
            [$today, $today, $today, $today, $week, $stale, ...$bp]
        );
        return [
            'today'     => (int) $c['today_cnt'],
            'overdue'   => (int) $c['overdue_cnt'],
            'auto'      => (int) $c['auto_cnt'],
            'upcoming'  => (int) $c['upcoming_cnt'],
            'due_total' => (int) $c['today_cnt'] + (int) $c['overdue_cnt'],
        ];
    }

    /** Log a call / WhatsApp / visit and schedule the next one - atomically. */
    public static function store(Request $req, array $p): array
    {
        $d = Validator::validate($req->json(), [
            'type'                => 'required|in:' . Enums::keys(Enums::FOLLOWUP_TYPES),
            'outcome'             => 'required|in:' . Enums::keys(Enums::OUTCOMES),
            'note'                => 'nullable|text|max:2000',
            'next_follow_up_date' => 'nullable|date',
            'next_follow_up_time' => 'nullable|time',
            'interest_level'      => 'nullable|in:' . Enums::keys(Enums::INTEREST),
            'lost_reason'         => 'nullable|in:' . Enums::keys(Enums::LOST_REASONS),
            'version'             => 'nullable|int',
            'idempotency_key'     => 'nullable|string|max:64',
        ]);
        [, $newStatus, $terminal, $isContact] = Enums::OUTCOMES[$d['outcome']];
        $today = Validator::today();

        $errors = [];
        if ($terminal) {
            if ($d['outcome'] === 'wrong_number') {
                $d['lost_reason'] = 'wrong_number';
            } elseif (empty($d['lost_reason'])) {
                $errors['lost_reason'] = 'Please select why the student is not joining.';
            }
        } else {
            if (empty($d['next_follow_up_date'])) {
                $errors['next_follow_up_date'] = 'Please set the next follow-up date so this enquiry is not forgotten.';
            } elseif ($d['next_follow_up_date'] < $today) {
                $errors['next_follow_up_date'] = 'Next follow-up date cannot be in the past.';
            }
        }
        if ($d['outcome'] === 'not_picked' || $d['outcome'] === 'busy') {
            // note optional
        } elseif ($d['outcome'] === 'rescheduled' && empty($d['note'])) {
            $errors['note'] = 'Please write why the follow-up was rescheduled.';
        }
        if ($errors) {
            throw HttpException::validation($errors);
        }

        $idem = $d['idempotency_key'] ?? null;
        if ($idem) {
            $prev = Db::one('SELECT enquiry_id FROM followups WHERE idempotency_key = ?', [$idem]);
            if ($prev) {
                return ['data' => E::present(E::findOrFail((int) $prev['enquiry_id'])), 'timeline' => E::timeline((int) $prev['enquiry_id']), 'replayed' => true];
            }
        }

        try {
            Db::tx(function () use ($p, $d, $newStatus, $terminal, $isContact, $idem) {
                $cur = Db::one('SELECT * FROM enquiries WHERE id = ? FOR UPDATE', [$p[0]]);
                if (!$cur || (int) $cur['is_archived']) {
                    throw new HttpException(404, 'Enquiry not found.');
                }
                if (!in_array($cur['status'], Enums::OPEN_STATUSES, true)) {
                    throw new HttpException(409, $cur['status'] === 'admitted'
                        ? 'This student is already admitted.'
                        : 'This enquiry is closed. Re-open it to add more follow-ups.');
                }
                if (!empty($d['version']) && (int) $d['version'] !== (int) $cur['version']) {
                    throw new HttpException(409, 'Someone else just updated this enquiry. Please reload to see the latest follow-up before adding yours.', [], 'version_conflict');
                }

                $scheduledFor = $cur['next_follow_up_date']
                    ?: (new \DateTimeImmutable(substr((string) ($cur['last_contact_at'] ?: $cur['created_at']), 0, 10)))->modify('+' . Settings::staleDays() . ' days')->format('Y-m-d');

                Db::insert('followups', [
                    'enquiry_id'          => $p[0],
                    'type'                => $d['type'],
                    'outcome'             => $d['outcome'],
                    'note'                => $d['note'] ?? null,
                    'scheduled_for'       => $scheduledFor,
                    'next_follow_up_date' => $terminal ? null : $d['next_follow_up_date'],
                    'idempotency_key'     => $idem,
                    'created_by'          => Auth::id(),
                ]);

                $set = [
                    'next_follow_up_date' => $terminal ? null : $d['next_follow_up_date'],
                    'next_follow_up_time' => $terminal ? null : ($d['next_follow_up_time'] ?? null),
                    'follow_up_count'     => (int) $cur['follow_up_count'] + 1,
                    'version'             => (int) $cur['version'] + 1,
                ];
                if ($newStatus !== null) {
                    $set['status'] = $newStatus;
                } elseif ($cur['status'] === 'new') {
                    $set['status'] = 'follow_up';
                }
                if ($isContact) {
                    $set['last_contact_at'] = date('Y-m-d H:i:s');
                }
                if (!empty($d['interest_level'])) {
                    $set['interest_level'] = $d['interest_level'];
                }
                if ($terminal) {
                    $set['lost_reason'] = $d['lost_reason'];
                }
                Db::update('enquiries', $p[0], $set);
                Audit::log('followup', 'enquiry', $p[0], 'Follow-up: ' . Enums::OUTCOMES[$d['outcome']][0], ['status' => $cur['status'], 'next' => $cur['next_follow_up_date']], ['status' => $set['status'] ?? $cur['status'], 'next' => $set['next_follow_up_date']]);
            });
        } catch (\PDOException $e) {
            if (Db::isDuplicate($e) && $idem) {
                $prev = Db::one('SELECT enquiry_id FROM followups WHERE idempotency_key = ?', [$idem]);
                if ($prev) {
                    return ['data' => E::present(E::findOrFail((int) $prev['enquiry_id'])), 'timeline' => E::timeline((int) $prev['enquiry_id']), 'replayed' => true];
                }
            }
            throw $e;
        }

        return ['data' => E::present(E::findOrFail($p[0])), 'timeline' => E::timeline($p[0]), '_status' => 201];
    }
}
