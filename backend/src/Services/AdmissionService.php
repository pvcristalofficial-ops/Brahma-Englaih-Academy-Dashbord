<?php
declare(strict_types=1);

namespace App\Services;

use App\Audit;
use App\Auth;
use App\Db;
use App\Enums;
use App\Fiscal;
use App\HttpException;
use App\Money;
use App\Settings;
use App\Validator;

final class AdmissionService
{
    public static function present(array $a): array
    {
        foreach (['id', 'enquiry_id', 'course_id', 'version', 'created_by'] as $k) {
            if (isset($a[$k])) {
                $a[$k] = (int) $a[$k];
            }
        }
        foreach (['total_fee', 'discount', 'net_fee', 'paid_amount'] as $k) {
            if (isset($a[$k])) {
                $a[$k] = (float) $a[$k];
            }
        }
        $a['balance'] = round(Money::paise($a['net_fee']) / 100 - Money::paise($a['paid_amount']) / 100, 2);
        $a['fee_state'] = $a['balance'] <= 0 ? 'clear'
            : (!empty($a['next_due_date']) && $a['next_due_date'] < Validator::today() ? 'overdue' : 'pending');
        return $a;
    }

    public static function presentReceipt(array $r): array
    {
        foreach (['id', 'admission_id', 'received_by', 'voided_by'] as $k) {
            if (isset($r[$k])) {
                $r[$k] = (int) $r[$k];
            }
        }
        foreach (['amount', 'balance_after', 'total_fee', 'discount', 'net_fee', 'paid_amount'] as $k) {
            if (isset($r[$k])) {
                $r[$k] = (float) $r[$k];
            }
        }
        unset($r['idempotency_key']);
        return $r;
    }

    public static function receiptFull(int $id): array
    {
        $r = Db::one(
            'SELECT r.*, a.admission_no, a.student_name, a.parent_name, a.phone, a.email, a.address, a.course_name,
                    a.batch_timing, a.start_date, a.admission_date, a.total_fee, a.discount, a.net_fee, a.paid_amount,
                    a.next_due_date, u.name AS received_by_name, vu.name AS voided_by_name
             FROM receipts r
             JOIN admissions a ON a.id = r.admission_id
             LEFT JOIN users u ON u.id = r.received_by
             LEFT JOIN users vu ON vu.id = r.voided_by
             WHERE r.id = ?',
            [$id]
        );
        if (!$r) {
            throw new HttpException(404, 'Receipt not found.');
        }
        $s = Settings::all();
        $r = self::presentReceipt($r);
        $r['academy'] = [
            'name'    => $s['academy_name'] ?? '',
            'tagline' => $s['academy_tagline'] ?? '',
            'address' => $s['academy_address'] ?? '',
            'phone'   => $s['academy_phone'] ?? '',
            'email'   => $s['academy_email'] ?? '',
            'website' => $s['academy_website'] ?? '',
            'gstin'   => $s['academy_gstin'] ?? '',
            'terms'   => $s['receipt_terms'] ?? '',
        ];
        return $r;
    }

    /**
     * Record one payment + its receipt against a LOCKED admission row. Must run inside Db::tx().
     * Guarantees: amount > 0, never more than the pending balance, a gap-free receipt number,
     * and admissions.paid_amount always equals the sum of valid receipts.
     */
    public static function recordPayment(array $adm, array $pay, ?string $idem): int
    {
        $today = Validator::today();
        $errors = [];
        $paise = Money::paise($pay['amount']);
        $balance = Money::paise($adm['net_fee']) - Money::paise($adm['paid_amount']);

        if ($paise <= 0) {
            $errors['amount'] = 'Amount must be greater than zero.';
        } elseif ($paise > $balance) {
            $errors['amount'] = 'Amount is more than the pending balance (₹' . Money::fmt($balance) . ').';
        }
        $date = $pay['payment_date'] ?? $today;
        $min = (new \DateTimeImmutable($today))->modify('-60 days')->format('Y-m-d');
        if ($date > $today) {
            $errors['payment_date'] = 'Payment date cannot be in the future.';
        } elseif ($date < $min) {
            $errors['payment_date'] = 'Payment date cannot be older than 60 days.';
        }
        if ($pay['payment_mode'] !== 'cash' && empty($pay['reference_no'])) {
            $errors['reference_no'] = 'Enter the UPI / transaction / cheque number for non-cash payments.';
        }
        $newBalance = $balance - $paise;
        $nextDue = $pay['next_due_date'] ?? null;
        if ($newBalance > 0) {
            if (!$nextDue) {
                $errors['next_due_date'] = 'Balance is pending - please set the next instalment due date.';
            } elseif ($nextDue < $today) {
                $errors['next_due_date'] = 'Due date cannot be in the past.';
            }
        } else {
            $nextDue = null;
        }
        if ($errors) {
            throw HttpException::validation($errors);
        }

        $fy = Fiscal::label();
        $seq = Db::nextCounter('receipt:' . $fy);
        $receiptNo = Fiscal::number(Settings::get('receipt_prefix', 'BEA') ?: 'BEA', '', $seq, $fy);
        $towards = $pay['towards'] ?? ('Course Fee - ' . $adm['course_name']);

        $rid = Db::insert('receipts', [
            'receipt_no'      => $receiptNo,
            'admission_id'    => (int) $adm['id'],
            'amount'          => Money::fmt($paise),
            'payment_date'    => $date,
            'payment_mode'    => $pay['payment_mode'],
            'reference_no'    => $pay['reference_no'] ?? null,
            'towards'         => $towards,
            'balance_after'   => Money::fmt($newBalance),
            'idempotency_key' => $idem ?: null,
            'received_by'     => Auth::id(),
        ]);
        $newPaid = Money::paise($adm['paid_amount']) + $paise;
        Db::exec(
            'UPDATE admissions SET paid_amount = ?, next_due_date = ?, status = ?, version = version + 1 WHERE id = ?',
            [Money::fmt($newPaid), $nextDue, $newBalance <= 0 ? 'completed' : 'active', $adm['id']]
        );
        Audit::log(
            'payment', 'receipt', $rid,
            "Receipt {$receiptNo}: ₹" . Money::fmt($paise) . ' from ' . $adm['student_name'] . ' (' . (Enums::PAYMENT_MODES[$pay['payment_mode']] ?? $pay['payment_mode']) . ')',
            null,
            ['admission' => $adm['admission_no'], 'amount' => Money::fmt($paise), 'balance_after' => Money::fmt($newBalance)]
        );
        return $rid;
    }
}
