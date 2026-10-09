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

final class EnquiryController
{
    private const SORTS = [
        'newest' => 'e.id DESC',
        'oldest' => 'e.id ASC',
        'name'   => 'e.student_name ASC',
        'recent_contact' => 'e.last_contact_at DESC, e.id DESC',
    ];

    /** Shared WHERE builder for list + export. */
    private static function filters(Request $req): array
    {
        $where = [];
        $p = [];
        $archived = $req->q('archived') === '1' && Auth::isAdmin();
        $where[] = 'e.is_archived = ' . ($archived ? '1' : '0');

        if (($q = $req->q('q')) !== null && $q !== '') {
            $like = '%' . addcslashes($q, '%_\\') . '%';
            $digits = preg_replace('/\D+/', '', $q) ?? '';
            $parts = ['e.student_name LIKE ?', 'e.parent_name LIKE ?', 'e.email LIKE ?', 'e.city LIKE ?'];
            $p = [...$p, $like, $like, $like, $like];
            if (strlen($digits) >= 3) {
                $parts[] = 'e.phone_normalized LIKE ?';
                $parts[] = 'e.alt_phone_normalized LIKE ?';
                $p[] = "%$digits%";
                $p[] = "%$digits%";
            }
            if (preg_match('/^ENQ-?0*(\d+)$/i', $q, $m)) {
                $parts[] = 'e.id = ?';
                $p[] = (int) $m[1];
            }
            $where[] = '(' . implode(' OR ', $parts) . ')';
        }
        foreach (['status' => 'e.status', 'source' => 'e.source', 'interest' => 'e.interest_level'] as $param => $col) {
            $v = $req->q($param);
            if ($v) {
                $vals = array_filter(explode(',', $v), static fn ($x) => preg_match('/^[a-z_]{2,30}$/', $x));
                if ($vals) {
                    $where[] = "$col IN (" . implode(',', array_fill(0, count($vals), '?')) . ')';
                    $p = [...$p, ...$vals];
                }
            }
        }
        if (($c = $req->qInt('course_id', 0, 0)) > 0) {
            $where[] = 'e.course_id = ?';
            $p[] = $c;
        }
        $as = $req->q('assigned_to');
        if ($as === 'me') {
            $where[] = 'e.assigned_to = ?';
            $p[] = Auth::id();
        } elseif ($as === 'none') {
            $where[] = 'e.assigned_to IS NULL';
        } elseif ($as !== null && ctype_digit($as)) {
            $where[] = 'e.assigned_to = ?';
            $p[] = (int) $as;
        }
        foreach (['from' => '>=', 'to' => '<='] as $param => $op) {
            $v = $req->q($param);
            if ($v && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) {
                $where[] = "e.enquiry_date $op ?";
                $p[] = $v;
            }
        }
        return [implode(' AND ', $where), $p];
    }

    public static function index(Request $req): array
    {
        [$where, $p] = self::filters($req);
        $page = $req->qInt('page', 1, 1, 100000);
        $per = $req->qInt('per_page', 25, 5, 100);
        $sort = self::SORTS[$req->q('sort', 'newest')] ?? self::SORTS['newest'];

        $total = (int) Db::val("SELECT COUNT(*) FROM enquiries e WHERE $where", $p);
        $offset = ($page - 1) * $per;
        $rows = Db::all(E::BASE_SELECT . " WHERE $where ORDER BY $sort LIMIT $per OFFSET $offset", $p);

        $today = Validator::today();
        $stale = Settings::staleDays();
        return [
            'data' => array_map(static fn ($r) => E::present($r, $today, $stale), $rows),
            'meta' => ['page' => $page, 'per_page' => $per, 'total' => $total, 'pages' => (int) ceil($total / $per)],
        ];
    }

    public static function checkDuplicate(Request $req): array
    {
        $phone = Validator::normalizePhone((string) $req->q('phone', ''));
        if ($phone === null) {
            return ['data' => ['valid' => false, 'exists' => false, 'existing' => null]];
        }
        $except = $req->qInt('except_id', 0, 0);
        $dup = E::findByPhones($phone, null, $except ?: null);
        return ['data' => ['valid' => true, 'exists' => (bool) $dup, 'existing' => $dup ? E::brief($dup) : null]];
    }

    public static function store(Request $req): array
    {
        $in = $req->json();
        $d = Validator::validate($in, self::createRules());
        [$row, $replayed] = E::create($d, Auth::id(), $d['idempotency_key'] ?? null);
        return ['data' => E::present($row), 'replayed' => $replayed, '_status' => $replayed ? 200 : 201];
    }

    public static function createRules(): array
    {
        return [
            'student_name'        => 'required|string|max:100',
            'parent_name'         => 'nullable|string|max:100',
            'phone'               => 'required|phone',
            'alt_phone'           => 'nullable|phone',
            'email'               => 'nullable|email',
            'city'                => 'nullable|string|max:80',
            'qualification'       => 'nullable|string|max:100',
            'course_id'           => 'nullable|int',
            'source'              => 'required|in:' . Enums::keys(Enums::SOURCES),
            'campaign'            => 'nullable|string|max:120',
            'interest_level'      => 'nullable|in:' . Enums::keys(Enums::INTEREST),
            'assigned_to'         => 'nullable|int',
            'notes'               => 'nullable|text|max:2000',
            'enquiry_date'        => 'nullable|date',
            'next_follow_up_date' => 'nullable|date',
            'next_follow_up_time' => 'nullable|time',
            'idempotency_key'     => 'nullable|string|max:64',
        ];
    }

    public static function show(Request $req, array $p): array
    {
        $e = E::findOrFail($p[0]);
        if ((int) $e['is_archived'] && !Auth::isAdmin()) {
            throw new HttpException(404, 'Enquiry not found.');
        }
        $admission = Db::one(
            'SELECT id, admission_no, net_fee, paid_amount, status FROM admissions WHERE enquiry_id = ?',
            [$p[0]]
        );
        return ['data' => [
            'enquiry'   => E::present($e),
            'timeline'  => E::timeline($p[0]),
            'admission' => $admission ? ['id' => (int) $admission['id']] + $admission : null,
        ]];
    }

    public static function update(Request $req, array $p): array
    {
        $in = $req->json();
        $rules = self::createRules();
        unset($rules['next_follow_up_date'], $rules['next_follow_up_time'], $rules['idempotency_key'], $rules['enquiry_date']);
        $rules['version'] = 'required|int';
        $d = Validator::validate($in, $rules, true);
        if (!array_key_exists('version', $d)) {
            throw HttpException::validation(['version' => 'Missing version. Reload and try again.']);
        }
        $version = (int) $d['version'];
        unset($d['version']);
        foreach (['student_name', 'phone', 'source'] as $k) {
            if (array_key_exists($k, $d) && $d[$k] === null) {
                throw HttpException::validation([$k => 'This field is required.']);
            }
        }

        try {
            $id = Db::tx(function () use ($p, $d, $version) {
                $cur = Db::one('SELECT * FROM enquiries WHERE id = ? FOR UPDATE', [$p[0]]);
                if (!$cur) {
                    throw new HttpException(404, 'Enquiry not found.');
                }
                if ((int) $cur['version'] !== $version) {
                    throw new HttpException(409, 'Someone else updated this enquiry while you were editing. Please reload and re-apply your change.', [], 'version_conflict');
                }
                if ((int) $cur['is_archived']) {
                    throw new HttpException(409, 'This enquiry is archived. Restore it before editing.');
                }
                $phone = $d['phone'] ?? $cur['phone'];
                $alt = array_key_exists('alt_phone', $d) ? $d['alt_phone'] : $cur['alt_phone'];
                if ($alt !== null && $alt === $phone) {
                    throw HttpException::validation(['alt_phone' => 'Alternate number must be different from the main number.']);
                }
                if (array_key_exists('phone', $d) || array_key_exists('alt_phone', $d)) {
                    $dup = E::findByPhones($phone, $alt, $p[0]);
                    if ($dup) {
                        throw new HttpException(409, 'This mobile number is already saved as ' . sprintf('ENQ-%05d', (int) $dup['id']) . ' (' . $dup['student_name'] . ').', [], 'duplicate', ['existing' => E::brief($dup)]);
                    }
                }
                E::assertRefs($d);

                $set = $d;
                if (array_key_exists('phone', $d)) {
                    $set['phone_normalized'] = $d['phone'];
                }
                if (array_key_exists('alt_phone', $d)) {
                    $set['alt_phone_normalized'] = $d['alt_phone'];
                }
                [$old, $new] = Audit::diff($cur, $set);
                if ($set === [] || $old === []) {
                    return $p[0];
                }
                $set['version'] = $version + 1;
                Db::update('enquiries', $p[0], $set);
                Audit::log('update', 'enquiry', $p[0], 'Enquiry details edited', $old, $new);
                return $p[0];
            });
        } catch (\PDOException $e) {
            if (Db::isDuplicate($e)) {
                throw new HttpException(409, 'This mobile number is already saved for another enquiry.', [], 'duplicate');
            }
            throw $e;
        }
        return ['data' => E::present(E::findOrFail($id))];
    }

    public static function archive(Request $req, array $p): array
    {
        $d = Validator::validate($req->json(), ['reason' => 'required|string|min:5|max:255']);
        Db::tx(function () use ($p, $d) {
            $cur = Db::one('SELECT id, student_name, is_archived, status FROM enquiries WHERE id = ? FOR UPDATE', [$p[0]]);
            if (!$cur) {
                throw new HttpException(404, 'Enquiry not found.');
            }
            if ($cur['status'] === 'admitted') {
                throw new HttpException(409, 'An admitted student cannot be archived.');
            }
            if ((int) $cur['is_archived']) {
                return;
            }
            Db::exec(
                'UPDATE enquiries SET is_archived = 1, archived_at = NOW(), archived_by = ?, archive_reason = ?, version = version + 1 WHERE id = ?',
                [Auth::id(), $d['reason'], $p[0]]
            );
            Audit::log('archive', 'enquiry', $p[0], "Archived: {$cur['student_name']}", null, ['reason' => $d['reason']]);
        });
        return ['data' => E::present(E::findOrFail($p[0]))];
    }

    public static function restore(Request $req, array $p): array
    {
        Db::tx(function () use ($p) {
            $cur = Db::one('SELECT id, student_name, is_archived FROM enquiries WHERE id = ? FOR UPDATE', [$p[0]]);
            if (!$cur) {
                throw new HttpException(404, 'Enquiry not found.');
            }
            if (!(int) $cur['is_archived']) {
                return;
            }
            Db::exec(
                'UPDATE enquiries SET is_archived = 0, archived_at = NULL, archived_by = NULL, archive_reason = NULL, version = version + 1 WHERE id = ?',
                [$p[0]]
            );
            Audit::log('restore', 'enquiry', $p[0], "Restored: {$cur['student_name']}");
        });
        return ['data' => E::present(E::findOrFail($p[0]))];
    }

    /** Re-open a "Lost" enquiry so it appears in follow-ups again. */
    public static function reopen(Request $req, array $p): array
    {
        $d = Validator::validate($req->json(), [
            'next_follow_up_date' => 'required|date',
            'note'                => 'nullable|text|max:500',
        ]);
        if ($d['next_follow_up_date'] < Validator::today()) {
            throw HttpException::validation(['next_follow_up_date' => 'Date cannot be in the past.']);
        }
        Db::tx(function () use ($p, $d) {
            $cur = Db::one('SELECT id, status, is_archived FROM enquiries WHERE id = ? FOR UPDATE', [$p[0]]);
            if (!$cur) {
                throw new HttpException(404, 'Enquiry not found.');
            }
            if ($cur['status'] !== 'lost' || (int) $cur['is_archived']) {
                throw new HttpException(409, 'Only a lost, non-archived enquiry can be re-opened.');
            }
            Db::exec(
                "UPDATE enquiries SET status = 'follow_up', lost_reason = NULL, next_follow_up_date = ?, version = version + 1 WHERE id = ?",
                [$d['next_follow_up_date'], $p[0]]
            );
            Db::insert('followups', [
                'enquiry_id' => $p[0], 'type' => 'other', 'outcome' => 'reopened', 'note' => $d['note'] ?? 'Enquiry re-opened',
                'next_follow_up_date' => $d['next_follow_up_date'], 'created_by' => Auth::id(),
            ]);
            Audit::log('reopen', 'enquiry', $p[0], 'Lost enquiry re-opened');
        });
        return ['data' => E::present(E::findOrFail($p[0]))];
    }

    /** CSV export (admin only). Cells are neutralised against spreadsheet formula injection. */
    public static function export(Request $req): never
    {
        [$where, $p] = self::filters($req);
        $rows = Db::all(E::BASE_SELECT . " WHERE $where ORDER BY e.id ASC", $p);
        Audit::log('export', 'enquiry', null, 'Enquiries exported to CSV (' . count($rows) . ' rows)');

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="enquiries-' . date('Y-m-d') . '.csv"');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        $out = fopen('php://output', 'w');
        fwrite($out, "\xEF\xBB\xBF"); // UTF-8 BOM so Excel shows Hindi/names correctly
        fputcsv($out, ['Enquiry No', 'Date', 'Student', 'Parent', 'Mobile', 'Alt Mobile', 'Email', 'City', 'Course', 'Source', 'Campaign', 'Status', 'Interest', 'Assigned To', 'Next Follow-up', 'Last Contact', 'Follow-ups', 'Notes']);
        $safe = static function ($v): string {
            $s = (string) $v;
            return $s !== '' && strpbrk($s[0], "=+-@\t\r") !== false ? "'" . $s : $s;
        };
        foreach ($rows as $r) {
            fputcsv($out, array_map($safe, [
                sprintf('ENQ-%05d', (int) $r['id']), $r['enquiry_date'], $r['student_name'], $r['parent_name'], $r['phone'], $r['alt_phone'],
                $r['email'], $r['city'], $r['course_name'], Enums::SOURCES[$r['source']] ?? $r['source'], $r['campaign'],
                Enums::STATUSES[$r['status']] ?? $r['status'], $r['interest_level'], $r['assigned_name'],
                $r['next_follow_up_date'], $r['last_contact_at'], $r['follow_up_count'], $r['notes'],
            ]));
        }
        fclose($out);
        exit;
    }
}
