<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Db;
use App\Request;

final class AuditController
{
    public static function index(Request $req): array
    {
        $where = ['1=1'];
        $p = [];
        if (($t = $req->q('entity')) && preg_match('/^[a-z_]{2,40}$/', $t)) {
            $where[] = 'l.entity_type = ?';
            $p[] = $t;
        }
        if (($a = $req->q('action')) && preg_match('/^[a-z_]{2,40}$/', $a)) {
            $where[] = 'l.action = ?';
            $p[] = $a;
        }
        if (($u = $req->qInt('user_id', 0, 0)) > 0) {
            $where[] = 'l.user_id = ?';
            $p[] = $u;
        }
        if (($eid = $req->qInt('entity_id', 0, 0)) > 0) {
            $where[] = 'l.entity_id = ?';
            $p[] = $eid;
        }
        if (($q = $req->q('q')) !== null && $q !== '') {
            $where[] = 'l.summary LIKE ?';
            $p[] = '%' . addcslashes($q, '%_\\') . '%';
        }
        $w = implode(' AND ', $where);
        $page = $req->qInt('page', 1, 1, 100000);
        $per = $req->qInt('per_page', 50, 10, 200);
        $offset = ($page - 1) * $per;
        $total = (int) Db::val("SELECT COUNT(*) FROM audit_logs l WHERE $w", $p);
        $rows = Db::all(
            "SELECT l.*, u.name AS user_name FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id
             WHERE $w ORDER BY l.id DESC LIMIT $per OFFSET $offset",
            $p
        );
        foreach ($rows as &$r) {
            $r['id'] = (int) $r['id'];
            $r['old_values'] = $r['old_values'] ? json_decode($r['old_values'], true) : null;
            $r['new_values'] = $r['new_values'] ? json_decode($r['new_values'], true) : null;
        }
        return ['data' => $rows, 'meta' => ['page' => $page, 'per_page' => $per, 'total' => $total, 'pages' => (int) ceil($total / $per)]];
    }
}
