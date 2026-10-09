<?php
declare(strict_types=1);

namespace App\Services;

use App\Audit;
use App\Db;
use App\Enums;
use App\HttpException;
use App\Settings;
use App\Validator;

final class EnquiryService
{
    public const BASE_SELECT = 'SELECT e.*, c.name AS course_name, u.name AS assigned_name
        FROM enquiries e
        LEFT JOIN courses c ON c.id = e.course_id
        LEFT JOIN users u ON u.id = e.assigned_to';

    /**
     * SQL expression for the day an open enquiry is due for a follow-up.
     *  - a scheduled follow-up date wins;
     *  - if nobody scheduled one, the enquiry resurfaces N days (default 7) after the last contact,
     *    so no enquiry can silently fall off the radar.
     * The "?" is the stale-days value.
     */
    public static function dueExpr(): string
    {
        return 'COALESCE(e.next_follow_up_date, DATE_ADD(DATE(COALESCE(e.last_contact_at, e.created_at)), INTERVAL ? DAY))';
    }

    public static function find(int $id): ?array
    {
        return Db::one(self::BASE_SELECT . ' WHERE e.id = ?', [$id]);
    }

    public static function findOrFail(int $id): array
    {
        $row = self::find($id);
        if (!$row) {
            throw new HttpException(404, 'Enquiry not found.');
        }
        return $row;
    }

    public static function present(array $r, ?string $today = null, ?int $stale = null): array
    {
        $today ??= Validator::today();
        $stale ??= Settings::staleDays();

        $open = in_array($r['status'], Enums::OPEN_STATUSES, true) && !(int) $r['is_archived'];
        $due = null;
        $state = null;
        $auto = false;
        $daysOverdue = 0;
        if ($open) {
            if (!empty($r['next_follow_up_date'])) {
                $due = $r['next_follow_up_date'];
            } else {
                $base = substr((string) ($r['last_contact_at'] ?: $r['created_at']), 0, 10);
                $due = (new \DateTimeImmutable($base))->modify("+{$stale} days")->format('Y-m-d');
                $auto = true;
            }
            if ($due < $today) {
                $state = 'overdue';
                $daysOverdue = (int) (new \DateTimeImmutable($due))->diff(new \DateTimeImmutable($today))->days;
            } elseif ($due === $today) {
                $state = 'today';
            } else {
                $state = 'upcoming';
            }
        }

        unset($r['phone_normalized'], $r['alt_phone_normalized'], $r['idempotency_key']);
        foreach (['id', 'course_id', 'assigned_to', 'follow_up_count', 'is_archived', 'archived_by', 'version', 'created_by'] as $k) {
            if (array_key_exists($k, $r) && $r[$k] !== null) {
                $r[$k] = (int) $r[$k];
            }
        }
        $r['enquiry_no'] = sprintf('ENQ-%05d', $r['id']);
        $r['due_date'] = $due;
        $r['due_state'] = $state;
        $r['days_overdue'] = $daysOverdue;
        $r['auto_added'] = $auto && $state !== null && $state !== 'upcoming';
        if (isset($r['next_follow_up_time'])) {
            $r['next_follow_up_time'] = substr((string) $r['next_follow_up_time'], 0, 5);
        }
        return $r;
    }

    /** Existing enquiry that uses this primary or alternate number (if any). */
    public static function findByPhones(string $phone, ?string $alt, ?int $exceptId = null): ?array
    {
        $nums = array_values(array_unique(array_filter([$phone, $alt])));
        $in = implode(',', array_fill(0, count($nums), '?'));
        $sql = self::BASE_SELECT . " WHERE (e.phone_normalized IN ($in) OR e.alt_phone_normalized IN ($in))";
        $params = [...$nums, ...$nums];
        if ($exceptId !== null) {
            $sql .= ' AND e.id <> ?';
            $params[] = $exceptId;
        }
        return Db::one($sql . ' LIMIT 1', $params);
    }

    public static function brief(array $r): array
    {
        return [
            'id'            => (int) $r['id'],
            'enquiry_no'    => sprintf('ENQ-%05d', (int) $r['id']),
            'student_name'  => $r['student_name'],
            'phone'         => $r['phone'],
            'status'        => $r['status'],
            'assigned_name' => $r['assigned_name'] ?? null,
            'created_at'    => $r['created_at'],
        ];
    }

    private static function duplicateError(array $existing): HttpException
    {
        return new HttpException(
            409,
            'This mobile number is already saved as enquiry ' . sprintf('ENQ-%05d', (int) $existing['id']) . ' (' . $existing['student_name'] . ').',
            [],
            'duplicate',
            ['existing' => self::brief($existing)]
        );
    }

    /**
     * Create an enquiry. Returns [row, replayed].
     * Duplicate protection is three-layered: client idempotency key, application pre-check, DB UNIQUE keys.
     */
    public static function create(array $d, ?int $userId, ?string $idemKey): array
    {
        $today = Validator::today();
        $d['enquiry_date'] = $d['enquiry_date'] ?? $today;
        if ($d['enquiry_date'] > $today) {
            throw HttpException::validation(['enquiry_date' => 'Enquiry date cannot be in the future.']);
        }
        $d['next_follow_up_date'] = $d['next_follow_up_date'] ?? $today;
        if ($d['next_follow_up_date'] < $today) {
            throw HttpException::validation(['next_follow_up_date' => 'Next follow-up date cannot be in the past.']);
        }
        if (($d['alt_phone'] ?? null) !== null && $d['alt_phone'] === $d['phone']) {
            throw HttpException::validation(['alt_phone' => 'Alternate number must be different from the main number.']);
        }
        self::assertRefs($d);

        if ($idemKey) {
            $prev = Db::one(self::BASE_SELECT . ' WHERE e.idempotency_key = ?', [$idemKey]);
            if ($prev) {
                return [$prev, true];
            }
        }
        $dup = self::findByPhones($d['phone'], $d['alt_phone'] ?? null);
        if ($dup) {
            throw self::duplicateError($dup);
        }

        $row = [
            'student_name'         => $d['student_name'],
            'parent_name'          => $d['parent_name'] ?? null,
            'phone'                => $d['phone'],
            'phone_normalized'     => $d['phone'],
            'alt_phone'            => $d['alt_phone'] ?? null,
            'alt_phone_normalized' => $d['alt_phone'] ?? null,
            'email'                => $d['email'] ?? null,
            'city'                 => $d['city'] ?? null,
            'qualification'        => $d['qualification'] ?? null,
            'course_id'            => $d['course_id'] ?? null,
            'source'               => $d['source'],
            'campaign'             => $d['campaign'] ?? null,
            'status'               => 'new',
            'interest_level'       => $d['interest_level'] ?? 'warm',
            'assigned_to'          => $d['assigned_to'] ?? $userId,
            'notes'                => $d['notes'] ?? null,
            'enquiry_date'         => $d['enquiry_date'],
            'next_follow_up_date'  => $d['next_follow_up_date'],
            'next_follow_up_time'  => $d['next_follow_up_time'] ?? null,
            'idempotency_key'      => $idemKey ?: null,
            'created_by'           => $userId,
        ];

        try {
            $id = Db::tx(function () use ($row) {
                $id = Db::insert('enquiries', $row);
                Audit::log('create', 'enquiry', $id, "New enquiry: {$row['student_name']} ({$row['phone']})", null, [
                    'student_name' => $row['student_name'], 'phone' => $row['phone'], 'source' => $row['source'],
                ]);
                return $id;
            });
        } catch (\PDOException $e) {
            if (!Db::isDuplicate($e)) {
                throw $e;
            }
            // Lost a race against an identical request: resolve it deterministically.
            if ($idemKey && ($prev = Db::one(self::BASE_SELECT . ' WHERE e.idempotency_key = ?', [$idemKey]))) {
                return [$prev, true];
            }
            $dup = self::findByPhones($d['phone'], $d['alt_phone'] ?? null);
            if ($dup) {
                throw self::duplicateError($dup);
            }
            throw $e;
        }
        return [self::findOrFail($id), false];
    }

    /** Foreign keys / references must point to real, active rows. */
    public static function assertRefs(array $d): void
    {
        $errors = [];
        if (!empty($d['course_id']) && !Db::val('SELECT 1 FROM courses WHERE id = ? AND is_active = 1', [$d['course_id']])) {
            $errors['course_id'] = 'Selected course is not available.';
        }
        if (!empty($d['assigned_to']) && !Db::val('SELECT 1 FROM users WHERE id = ? AND is_active = 1', [$d['assigned_to']])) {
            $errors['assigned_to'] = 'Selected counsellor is not available.';
        }
        if ($errors) {
            throw HttpException::validation($errors);
        }
    }

    public static function timeline(int $enquiryId): array
    {
        $rows = Db::all(
            'SELECT f.id, f.type, f.outcome, f.note, f.scheduled_for, f.followed_at, f.next_follow_up_date, u.name AS by_name
             FROM followups f LEFT JOIN users u ON u.id = f.created_by
             WHERE f.enquiry_id = ? ORDER BY f.followed_at DESC, f.id DESC',
            [$enquiryId]
        );
        foreach ($rows as &$r) {
            $r['id'] = (int) $r['id'];
        }
        return $rows;
    }
}
