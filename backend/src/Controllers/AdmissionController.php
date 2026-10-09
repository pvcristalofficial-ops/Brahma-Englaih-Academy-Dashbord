<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Audit;
use App\Auth;
use App\Db;
use App\Enums;
use App\Fiscal;
use App\HttpException;
use App\Money;
use App\Request;
use App\Services\AdmissionService as A;
use App\Services\EnquiryService as E;
use App\Settings;
use App\Validator;

final class AdmissionController
{
    private static function paymentRules(): array
    {
        return [
            'amount'          => 'required|money',
            'payment_mode'    => 'required|in:' . Enums::keys(Enums::PAYMENT_MODES),
            'reference_no'    => 'nullable|string|max:80',
            'payment_date'    => 'nullable|date',
            'towards'         => 'nullable|string|max:160',
            'next_due_date'   => 'nullable|date',
            'idempotency_key' => 'nullable|string|max:64',
        ];
    }

    /** Confirm admission: creates the admission, the first receipt and closes the enquiry in ONE transaction. */
    public static function admit(Request $req, array $p): array
    {
        $d = Validator::validate($req->json(), self::paymentRules() + [
            'course_id'    => 'required|int',
            'total_fee'    => 'required|money',
            'discount'     => 'nullable|money',
            'parent_name'  => 'nullable|string|max:100',
            'address'      => 'nullable|string|max:255',
            'batch_timing' => 'nullable|string|max:80',
            'start_date'   => 'nullable|date',
            'notes'        => 'nullable|string|max:500',
        ]);
        $idem = $d['idempotency_key'] ?? null;

        if ($idem && ($prev = Db::one('SELECT id, admission_id FROM receipts WHERE idempotency_key = ?', [$idem]))) {
            return self::admitResponse((int) $prev['admission_id'], (int) $prev['id'], true);
        }

        $total = Money::paise($d['total_fee']);
        $disc = Money::paise($d['discount'] ?? 0);
        $errors = [];
        if ($total <= 0) {
            $errors['total_fee'] = 'Total fee must be greater than zero.';
        }
        if ($disc > $total) {
            $errors['discount'] = 'Discount cannot be more than the total fee.';
        }
        if ($errors) {
            throw HttpException::validation($errors);
        }
        $net = $total - $disc;

        try {
            [$aid, $rid] = Db::tx(function () use ($p, $d, $total, $disc, $net, $idem) {
                $enq = Db::one('SELECT * FROM enquiries WHERE id = ? FOR UPDATE', [$p[0]]);
                if (!$enq || (int) $enq['is_archived']) {
                    throw new HttpException(404, 'Enquiry not found.');
                }
                if ($enq['status'] === 'admitted') {
                    throw new HttpException(409, 'This student is already admitted.', [], 'already_admitted');
                }
                $course = Db::one('SELECT id, name FROM courses WHERE id = ? AND is_active = 1', [$d['course_id']]);
                if (!$course) {
                    throw HttpException::validation(['course_id' => 'Selected course is not available.']);
                }

                $fy = Fiscal::label();
                $prefix = Settings::get('receipt_prefix', 'BEA') ?: 'BEA';
                $admNo = Fiscal::number($prefix, 'ADM', Db::nextCounter('admission:' . $fy), $fy);
                $today = Validator::today();

                $aid = Db::insert('admissions', [
                    'admission_no'   => $admNo,
                    'enquiry_id'     => (int) $enq['id'],
                    'student_name'   => $enq['student_name'],
                    'parent_name'    => $d['parent_name'] ?? $enq['parent_name'],
                    'phone'          => $enq['phone'],
                    'email'          => $enq['email'],
                    'address'        => $d['address'] ?? $enq['city'],
                    'course_id'      => (int) $course['id'],
                    'course_name'    => $course['name'],
                    'batch_timing'   => $d['batch_timing'] ?? null,
                    'admission_date' => $today,
                    'start_date'     => $d['start_date'] ?? null,
                    'total_fee'      => Money::fmt($total),
                    'discount'       => Money::fmt($disc),
                    'net_fee'        => Money::fmt($net),
                    'paid_amount'    => '0.00',
                    'notes'          => $d['notes'] ?? null,
                    'created_by'     => Auth::id(),
                ]);
                $adm = Db::one('SELECT * FROM admissions WHERE id = ?', [$aid]);
                $rid = A::recordPayment($adm, $d, $idem);

                Db::exec(
                    "UPDATE enquiries SET status = 'admitted', admitted_at = NOW(), next_follow_up_date = NULL,
                            next_follow_up_time = NULL, lost_reason = NULL, version = version + 1 WHERE id = ?",
                    [$enq['id']]
                );
                $rno = Db::val('SELECT receipt_no FROM receipts WHERE id = ?', [$rid]);
                Db::insert('followups', [
                    'enquiry_id' => (int) $enq['id'], 'type' => 'other', 'outcome' => 'admitted',
                    'note' => "Admission confirmed ({$admNo}) - receipt {$rno}", 'created_by' => Auth::id(),
                ]);
                Audit::log('admit', 'admission', $aid, "Admission confirmed: {$enq['student_name']} -> {$course['name']} ({$admNo})", null, [
                    'net_fee' => Money::fmt($net), 'enquiry' => (int) $enq['id'],
                ]);
                return [$aid, $rid];
            });
        } catch (\PDOException $e) {
            if (Db::isDuplicate($e)) {
                $key = Db::duplicateKey($e);
                if ($key === 'uq_admissions_enquiry') {
                    throw new HttpException(409, 'This student is already admitted.', [], 'already_admitted');
                }
                if ($key === 'uq_receipts_idem' && $idem && ($prev = Db::one('SELECT id, admission_id FROM receipts WHERE idempotency_key = ?', [$idem]))) {
                    return self::admitResponse((int) $prev['admission_id'], (int) $prev['id'], true);
                }
            }
            throw $e;
        }
        return self::admitResponse($aid, $rid, false);
    }

    private static function admitResponse(int $aid, int $rid, bool $replayed): array
    {
        return [
            'data' => [
                'admission' => A::present(Db::one('SELECT * FROM admissions WHERE id = ?', [$aid])),
                'receipt'   => A::receiptFull($rid),
            ],
            'replayed' => $replayed,
            '_status'  => $replayed ? 200 : 201,
        ];
    }

    public static function addPayment(Request $req, array $p): array
    {
        $d = Validator::validate($req->json(), self::paymentRules());
        $idem = $d['idempotency_key'] ?? null;
        if ($idem && ($prev = Db::one('SELECT id FROM receipts WHERE idempotency_key = ?', [$idem]))) {
            return ['data' => A::receiptFull((int) $prev['id']), 'replayed' => true];
        }
        try {
            $rid = Db::tx(function () use ($p, $d, $idem) {
                $adm = Db::one('SELECT * FROM admissions WHERE id = ? FOR UPDATE', [$p[0]]);
                if (!$adm) {
                    throw new HttpException(404, 'Admission not found.');
                }
                return A::recordPayment($adm, $d, $idem);
            });
        } catch (\PDOException $e) {
            if (Db::isDuplicate($e) && $idem && ($prev = Db::one('SELECT id FROM receipts WHERE idempotency_key = ?', [$idem]))) {
                return ['data' => A::receiptFull((int) $prev['id']), 'replayed' => true];
            }
            throw $e;
        }
        return ['data' => A::receiptFull($rid), 'replayed' => false, '_status' => 201];
    }

    public static function index(Request $req): array
    {
        $where = ['1=1'];
        $p = [];
        if (($q = $req->q('q')) !== null && $q !== '') {
            $like = '%' . addcslashes($q, '%_\\') . '%';
            $parts = ['a.student_name LIKE ?', 'a.admission_no LIKE ?', 'a.parent_name LIKE ?'];
            $p = [$like, $like, $like];
            $digits = preg_replace('/\D+/', '', $q) ?? '';
            if (strlen($digits) >= 3) {
                $parts[] = 'a.phone LIKE ?';
                $p[] = "%$digits%";
            }
            $where[] = '(' . implode(' OR ', $parts) . ')';
        }
        if (($c = $req->qInt('course_id', 0, 0)) > 0) {
            $where[] = 'a.course_id = ?';
            $p[] = $c;
        }
        $fees = $req->q('fees');
        if ($fees === 'pending') {
            $where[] = 'a.net_fee > a.paid_amount';
        } elseif ($fees === 'clear') {
            $where[] = 'a.net_fee <= a.paid_amount';
        } elseif ($fees === 'overdue') {
            $where[] = 'a.net_fee > a.paid_amount AND a.next_due_date < ?';
            $p[] = Validator::today();
        }
        foreach (['from' => '>=', 'to' => '<='] as $param => $op) {
            $v = $req->q($param);
            if ($v && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) {
                $where[] = "a.admission_date $op ?";
                $p[] = $v;
            }
        }
        $w = implode(' AND ', $where);
        $page = $req->qInt('page', 1, 1, 100000);
        $per = $req->qInt('per_page', 25, 5, 100);
        $total = (int) Db::val("SELECT COUNT(*) FROM admissions a WHERE $w", $p);
        $offset = ($page - 1) * $per;
        $rows = Db::all("SELECT a.* FROM admissions a WHERE $w ORDER BY a.id DESC LIMIT $per OFFSET $offset", $p);
        return [
            'data' => array_map([A::class, 'present'], $rows),
            'meta' => ['page' => $page, 'per_page' => $per, 'total' => $total, 'pages' => (int) ceil($total / $per)],
        ];
    }

    public static function show(Request $req, array $p): array
    {
        $a = Db::one('SELECT * FROM admissions WHERE id = ?', [$p[0]]);
        if (!$a) {
            throw new HttpException(404, 'Admission not found.');
        }
        $receipts = Db::all(
            'SELECT r.*, u.name AS received_by_name FROM receipts r LEFT JOIN users u ON u.id = r.received_by
             WHERE r.admission_id = ? ORDER BY r.id ASC',
            [$p[0]]
        );
        $enq = E::find((int) $a['enquiry_id']);
        return ['data' => [
            'admission' => A::present($a),
            'receipts'  => array_map([A::class, 'presentReceipt'], $receipts),
            'enquiry'   => $enq ? E::brief($enq) : null,
        ]];
    }

    public static function update(Request $req, array $p): array
    {
        $d = Validator::validate($req->json(), [
            'parent_name'   => 'nullable|string|max:100',
            'address'       => 'nullable|string|max:255',
            'email'         => 'nullable|email',
            'batch_timing'  => 'nullable|string|max:80',
            'start_date'    => 'nullable|date',
            'next_due_date' => 'nullable|date',
            'notes'         => 'nullable|string|max:500',
            'version'       => 'required|int',
        ], true);
        if (!isset($d['version'])) {
            throw HttpException::validation(['version' => 'Missing version. Reload and try again.']);
        }
        $version = (int) $d['version'];
        unset($d['version']);
        Db::tx(function () use ($p, $d, $version) {
            $cur = Db::one('SELECT * FROM admissions WHERE id = ? FOR UPDATE', [$p[0]]);
            if (!$cur) {
                throw new HttpException(404, 'Admission not found.');
            }
            if ((int) $cur['version'] !== $version) {
                throw new HttpException(409, 'Someone else updated this record. Please reload and try again.', [], 'version_conflict');
            }
            if (array_key_exists('next_due_date', $d)) {
                if (Money::paise($cur['net_fee']) <= Money::paise($cur['paid_amount'])) {
                    $d['next_due_date'] = null;
                } elseif ($d['next_due_date'] === null) {
                    throw HttpException::validation(['next_due_date' => 'Balance is pending - a due date is required.']);
                }
            }
            [$old, $new] = Audit::diff($cur, $d);
            if ($old === []) {
                return;
            }
            $d['version'] = $version + 1;
            Db::update('admissions', $p[0], $d);
            Audit::log('update', 'admission', $p[0], 'Admission details edited', $old, $new);
        });
        return ['data' => A::present(Db::one('SELECT * FROM admissions WHERE id = ?', [$p[0]]))];
    }

    /** Admin-only correction of a wrongly typed fee / discount. Paid amount is never changed here. */
    public static function adjustFee(Request $req, array $p): array
    {
        $d = Validator::validate($req->json(), [
            'total_fee' => 'required|money',
            'discount'  => 'nullable|money',
            'reason'    => 'required|string|min:5|max:255',
        ]);
        $total = Money::paise($d['total_fee']);
        $disc = Money::paise($d['discount'] ?? 0);
        if ($disc > $total) {
            throw HttpException::validation(['discount' => 'Discount cannot be more than the total fee.']);
        }
        Db::tx(function () use ($p, $d, $total, $disc) {
            $cur = Db::one('SELECT * FROM admissions WHERE id = ? FOR UPDATE', [$p[0]]);
            if (!$cur) {
                throw new HttpException(404, 'Admission not found.');
            }
            $net = $total - $disc;
            $paid = Money::paise($cur['paid_amount']);
            if ($net < $paid) {
                throw HttpException::validation(['total_fee' => 'Net fee cannot be less than the amount already paid (₹' . Money::fmt($paid) . ').']);
            }
            $status = $net - $paid <= 0 ? 'completed' : 'active';
            $nextDue = $status === 'completed' ? null : $cur['next_due_date'];
            Db::exec(
                'UPDATE admissions SET total_fee = ?, discount = ?, net_fee = ?, status = ?, next_due_date = ?, version = version + 1 WHERE id = ?',
                [Money::fmt($total), Money::fmt($disc), Money::fmt($net), $status, $nextDue, $p[0]]
            );
            Audit::log('adjust_fee', 'admission', $p[0], 'Fee corrected: ' . $d['reason'],
                ['total_fee' => $cur['total_fee'], 'discount' => $cur['discount'], 'net_fee' => $cur['net_fee']],
                ['total_fee' => Money::fmt($total), 'discount' => Money::fmt($disc), 'net_fee' => Money::fmt($net)]);
        });
        return ['data' => A::present(Db::one('SELECT * FROM admissions WHERE id = ?', [$p[0]]))];
    }

    /** Pending instalments, most urgent first. */
    public static function dues(Request $req): array
    {
        $today = Validator::today();
        $week = (new \DateTimeImmutable($today))->modify('+7 days')->format('Y-m-d');
        $base = 'a.net_fee > a.paid_amount';
        $filter = $req->q('filter', 'all');
        $extra = match ($filter) {
            'overdue'  => ' AND a.next_due_date < ?',
            'today'    => ' AND a.next_due_date = ?',
            'upcoming' => ' AND a.next_due_date > ? AND a.next_due_date <= ?',
            default    => '',
        };
        $params = match ($filter) {
            'overdue', 'today' => [$today],
            'upcoming'         => [$today, $week],
            default            => [],
        };
        $rows = Db::all(
            "SELECT a.* FROM admissions a WHERE $base$extra ORDER BY a.next_due_date IS NULL, a.next_due_date ASC, a.id ASC LIMIT 500",
            $params
        );
        $c = Db::one(
            "SELECT COUNT(*) AS n, COALESCE(SUM(net_fee - paid_amount),0) AS amt,
                    COALESCE(SUM(next_due_date < ?),0) AS overdue_n,
                    COALESCE(SUM(CASE WHEN next_due_date < ? THEN net_fee - paid_amount ELSE 0 END),0) AS overdue_amt,
                    COALESCE(SUM(next_due_date = ?),0) AS today_n,
                    COALESCE(SUM(next_due_date > ? AND next_due_date <= ?),0) AS upcoming_n
             FROM admissions a WHERE $base",
            [$today, $today, $today, $today, $week]
        );
        return [
            'data' => array_map([A::class, 'present'], $rows),
            'counts' => [
                'pending' => (int) $c['n'], 'pending_amount' => (float) $c['amt'],
                'overdue' => (int) $c['overdue_n'], 'overdue_amount' => (float) $c['overdue_amt'],
                'today' => (int) $c['today_n'], 'upcoming' => (int) $c['upcoming_n'],
            ],
        ];
    }
}
