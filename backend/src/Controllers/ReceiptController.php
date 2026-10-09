<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Audit;
use App\Auth;
use App\Db;
use App\Enums;
use App\HttpException;
use App\Money;
use App\Request;
use App\Services\AdmissionService as A;
use App\Validator;

final class ReceiptController
{
    public static function index(Request $req): array
    {
        $where = ['1=1'];
        $p = [];
        if (($q = $req->q('q')) !== null && $q !== '') {
            $like = '%' . addcslashes($q, '%_\\') . '%';
            $parts = ['r.receipt_no LIKE ?', 'a.student_name LIKE ?', 'a.admission_no LIKE ?', 'r.reference_no LIKE ?'];
            $p = [$like, $like, $like, $like];
            $digits = preg_replace('/\D+/', '', $q) ?? '';
            if (strlen($digits) >= 3) {
                $parts[] = 'a.phone LIKE ?';
                $p[] = "%$digits%";
            }
            $where[] = '(' . implode(' OR ', $parts) . ')';
        }
        if (($m = $req->q('mode')) && isset(Enums::PAYMENT_MODES[$m])) {
            $where[] = 'r.payment_mode = ?';
            $p[] = $m;
        }
        if (in_array($req->q('status'), ['valid', 'void'], true)) {
            $where[] = 'r.status = ?';
            $p[] = $req->q('status');
        }
        foreach (['from' => '>=', 'to' => '<='] as $param => $op) {
            $v = $req->q($param);
            if ($v && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) {
                $where[] = "r.payment_date $op ?";
                $p[] = $v;
            }
        }
        $w = implode(' AND ', $where);
        $page = $req->qInt('page', 1, 1, 100000);
        $per = $req->qInt('per_page', 25, 5, 100);
        $offset = ($page - 1) * $per;
        $total = (int) Db::val("SELECT COUNT(*) FROM receipts r JOIN admissions a ON a.id = r.admission_id WHERE $w", $p);
        $sum = Db::val("SELECT COALESCE(SUM(r.amount),0) FROM receipts r JOIN admissions a ON a.id = r.admission_id WHERE $w AND r.status = 'valid'", $p);
        $rows = Db::all(
            "SELECT r.*, a.admission_no, a.student_name, a.phone, a.course_name
             FROM receipts r JOIN admissions a ON a.id = r.admission_id
             WHERE $w ORDER BY r.id DESC LIMIT $per OFFSET $offset",
            $p
        );
        return [
            'data' => array_map([A::class, 'presentReceipt'], $rows),
            'meta' => ['page' => $page, 'per_page' => $per, 'total' => $total, 'pages' => (int) ceil($total / $per), 'valid_total' => (float) $sum],
        ];
    }

    public static function show(Request $req, array $p): array
    {
        return ['data' => A::receiptFull($p[0])];
    }

    /** Admin only. A receipt is never deleted: it is marked VOID with a reason and the balance is restored. */
    public static function void(Request $req, array $p): array
    {
        $d = Validator::validate($req->json(), ['reason' => 'required|string|min:5|max:255']);
        Db::tx(function () use ($p, $d) {
            $r = Db::one('SELECT * FROM receipts WHERE id = ? FOR UPDATE', [$p[0]]);
            if (!$r) {
                throw new HttpException(404, 'Receipt not found.');
            }
            if ($r['status'] === 'void') {
                throw new HttpException(409, 'This receipt is already void.');
            }
            $adm = Db::one('SELECT * FROM admissions WHERE id = ? FOR UPDATE', [$r['admission_id']]);
            $newPaid = Money::paise($adm['paid_amount']) - Money::paise($r['amount']);
            if ($newPaid < 0) {
                throw new HttpException(409, 'Cannot void: paid amount would become negative. Please contact support.');
            }
            Db::exec(
                "UPDATE receipts SET status = 'void', void_reason = ?, voided_by = ?, voided_at = NOW() WHERE id = ?",
                [$d['reason'], Auth::id(), $p[0]]
            );
            $balance = Money::paise($adm['net_fee']) - $newPaid;
            $nextDue = $adm['next_due_date'] ?: (new \DateTimeImmutable('today'))->format('Y-m-d');
            Db::exec(
                'UPDATE admissions SET paid_amount = ?, status = ?, next_due_date = ?, version = version + 1 WHERE id = ?',
                [Money::fmt($newPaid), $balance > 0 ? 'active' : 'completed', $balance > 0 ? $nextDue : null, $adm['id']]
            );
            Audit::log('void', 'receipt', $p[0], "Receipt {$r['receipt_no']} voided: {$d['reason']}", ['status' => 'valid'], ['status' => 'void', 'amount' => $r['amount']]);
        });
        return ['data' => A::receiptFull($p[0])];
    }
}
