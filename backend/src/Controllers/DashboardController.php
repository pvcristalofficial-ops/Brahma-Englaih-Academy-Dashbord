<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Db;
use App\Enums;
use App\Request;
use App\Services\AdmissionService as A;
use App\Settings;
use App\Validator;

final class DashboardController
{
    public static function summary(Request $req): array
    {
        $today = Validator::today();
        $days = in_array($req->qInt('days', 30), [7, 14, 30, 90, 180, 365], true) ? $req->qInt('days', 30) : 30;
        $from = (new \DateTimeImmutable($today))->modify('-' . ($days - 1) . ' days')->format('Y-m-d');
        $monthStart = (new \DateTimeImmutable($today))->format('Y-m-01');
        $stale = Settings::staleDays();
        $isAdmin = Auth::isAdmin();

        // ---- Follow-ups (for the logged-in user's scope)
        [$base, $bp] = FollowupController::scope($isAdmin ? 'all' : 'mine');
        $follow = FollowupController::counts($today, $stale, $base, $bp);

        // ---- Headline numbers
        $enqToday = (int) Db::val('SELECT COUNT(*) FROM enquiries WHERE is_archived = 0 AND enquiry_date = ?', [$today]);
        $enqPeriod = (int) Db::val('SELECT COUNT(*) FROM enquiries WHERE is_archived = 0 AND enquiry_date BETWEEN ? AND ?', [$from, $today]);
        $admPeriod = (int) Db::val('SELECT COUNT(*) FROM admissions WHERE admission_date BETWEEN ? AND ?', [$from, $today]);
        $admToday = (int) Db::val('SELECT COUNT(*) FROM admissions WHERE admission_date = ?', [$today]);
        $revPeriod = (float) Db::val("SELECT COALESCE(SUM(amount),0) FROM receipts WHERE status = 'valid' AND payment_date BETWEEN ? AND ?", [$from, $today]);
        $revToday = (float) Db::val("SELECT COALESCE(SUM(amount),0) FROM receipts WHERE status = 'valid' AND payment_date = ?", [$today]);
        $revMonth = (float) Db::val("SELECT COALESCE(SUM(amount),0) FROM receipts WHERE status = 'valid' AND payment_date BETWEEN ? AND ?", [$monthStart, $today]);
        $cohort = Db::one(
            "SELECT COUNT(*) AS n, COALESCE(SUM(status = 'admitted'),0) AS adm
             FROM enquiries WHERE is_archived = 0 AND enquiry_date BETWEEN ? AND ?",
            [$from, $today]
        );
        $fees = Db::one(
            'SELECT COUNT(*) AS n, COALESCE(SUM(net_fee - paid_amount),0) AS amt,
                    COALESCE(SUM(CASE WHEN next_due_date < ? THEN 1 ELSE 0 END),0) AS overdue_n,
                    COALESCE(SUM(CASE WHEN next_due_date < ? THEN net_fee - paid_amount ELSE 0 END),0) AS overdue_amt
             FROM admissions WHERE net_fee > paid_amount',
            [$today, $today]
        );
        $hot = (int) Db::val("SELECT COUNT(*) FROM enquiries WHERE is_archived = 0 AND interest_level = 'hot' AND status IN ('new','follow_up','demo_scheduled')");

        // ---- Daily trend (zero-filled)
        $trend = [];
        for ($i = 0; $i < $days; $i++) {
            $d = (new \DateTimeImmutable($from))->modify("+$i days")->format('Y-m-d');
            $trend[$d] = ['date' => $d, 'enquiries' => 0, 'admissions' => 0, 'revenue' => 0.0];
        }
        foreach (Db::all('SELECT enquiry_date AS d, COUNT(*) AS n FROM enquiries WHERE is_archived = 0 AND enquiry_date BETWEEN ? AND ? GROUP BY enquiry_date', [$from, $today]) as $r) {
            $trend[$r['d']]['enquiries'] = (int) $r['n'];
        }
        foreach (Db::all('SELECT admission_date AS d, COUNT(*) AS n FROM admissions WHERE admission_date BETWEEN ? AND ? GROUP BY admission_date', [$from, $today]) as $r) {
            $trend[$r['d']]['admissions'] = (int) $r['n'];
        }
        foreach (Db::all("SELECT payment_date AS d, SUM(amount) AS s FROM receipts WHERE status = 'valid' AND payment_date BETWEEN ? AND ? GROUP BY payment_date", [$from, $today]) as $r) {
            $trend[$r['d']]['revenue'] = (float) $r['s'];
        }

        // ---- Marketing performance: which source / campaign brings admissions & money
        $revBySource = [];
        foreach (Db::all(
            "SELECT e.source, SUM(r.amount) AS s FROM receipts r
             JOIN admissions a ON a.id = r.admission_id JOIN enquiries e ON e.id = a.enquiry_id
             WHERE r.status = 'valid' AND r.payment_date BETWEEN ? AND ? GROUP BY e.source",
            [$from, $today]
        ) as $r) {
            $revBySource[$r['source']] = (float) $r['s'];
        }
        $bySource = [];
        foreach (Db::all(
            "SELECT source, COUNT(*) AS n, SUM(status = 'admitted') AS adm FROM enquiries
             WHERE is_archived = 0 AND enquiry_date BETWEEN ? AND ? GROUP BY source ORDER BY n DESC",
            [$from, $today]
        ) as $r) {
            $n = (int) $r['n'];
            $adm = (int) $r['adm'];
            $bySource[] = [
                'source' => $r['source'], 'label' => Enums::SOURCES[$r['source']] ?? $r['source'],
                'enquiries' => $n, 'admissions' => $adm, 'conversion' => $n ? round($adm * 100 / $n, 1) : 0.0,
                'revenue' => $revBySource[$r['source']] ?? 0.0,
            ];
        }
        $byCampaign = array_map(static function ($r) {
            $n = (int) $r['n'];
            $adm = (int) $r['adm'];
            return ['campaign' => $r['campaign'], 'enquiries' => $n, 'admissions' => $adm, 'conversion' => $n ? round($adm * 100 / $n, 1) : 0.0];
        }, Db::all(
            "SELECT campaign, COUNT(*) AS n, SUM(status = 'admitted') AS adm FROM enquiries
             WHERE is_archived = 0 AND campaign IS NOT NULL AND campaign <> '' AND enquiry_date BETWEEN ? AND ?
             GROUP BY campaign ORDER BY n DESC LIMIT 10",
            [$from, $today]
        ));

        $byCourse = array_map(static fn ($r) => ['course' => $r['course_name'], 'admissions' => (int) $r['n'], 'net_fee' => (float) $r['s']], Db::all(
            'SELECT course_name, COUNT(*) AS n, SUM(net_fee) AS s FROM admissions WHERE admission_date BETWEEN ? AND ? GROUP BY course_name ORDER BY n DESC LIMIT 8',
            [$from, $today]
        ));

        // ---- Pipeline snapshot (all time, not archived)
        $pipeline = array_fill_keys(array_keys(Enums::STATUSES), 0);
        foreach (Db::all('SELECT status, COUNT(*) AS n FROM enquiries WHERE is_archived = 0 GROUP BY status') as $r) {
            $pipeline[$r['status']] = (int) $r['n'];
        }

        $recent = array_map([A::class, 'present'], Db::all('SELECT * FROM admissions ORDER BY id DESC LIMIT 5'));

        $team = [];
        if ($isAdmin) {
            foreach (Db::all(
                "SELECT u.id, u.name,
                        (SELECT COUNT(*) FROM followups f WHERE f.created_by = u.id AND f.followed_at >= ? AND f.outcome NOT IN ('admitted','reenquiry','reopened')) AS calls,
                        (SELECT COUNT(*) FROM admissions a WHERE a.created_by = u.id AND a.admission_date BETWEEN ? AND ?) AS adm,
                        (SELECT COUNT(*) FROM enquiries e WHERE e.is_archived = 0 AND e.assigned_to = u.id AND e.status IN ('new','follow_up','demo_scheduled')) AS open_leads
                 FROM users u WHERE u.is_active = 1 ORDER BY calls DESC",
                [$from . ' 00:00:00', $from, $today]
            ) as $r) {
                $team[] = ['id' => (int) $r['id'], 'name' => $r['name'], 'followups' => (int) $r['calls'], 'admissions' => (int) $r['adm'], 'open_leads' => (int) $r['open_leads']];
            }
        }

        return ['data' => [
            'range'    => ['days' => $days, 'from' => $from, 'to' => $today],
            'followups' => $follow,
            'kpi' => [
                'enquiries_today'   => $enqToday,
                'enquiries_period'  => $enqPeriod,
                'admissions_today'  => $admToday,
                'admissions_period' => $admPeriod,
                'revenue_today'     => $revToday,
                'revenue_period'    => $revPeriod,
                'revenue_month'     => $revMonth,
                'conversion'        => (int) $cohort['n'] ? round((int) $cohort['adm'] * 100 / (int) $cohort['n'], 1) : 0.0,
                'hot_leads'         => $hot,
                'fees_pending'      => (float) $fees['amt'],
                'fees_pending_count' => (int) $fees['n'],
                'fees_overdue'      => (float) $fees['overdue_amt'],
                'fees_overdue_count' => (int) $fees['overdue_n'],
            ],
            'trend'       => array_values($trend),
            'by_source'   => $bySource,
            'by_campaign' => $byCampaign,
            'by_course'   => $byCourse,
            'pipeline'    => $pipeline,
            'recent_admissions' => $recent,
            'team'        => $team,
        ]];
    }
}
