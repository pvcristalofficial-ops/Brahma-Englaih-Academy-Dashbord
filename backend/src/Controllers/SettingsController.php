<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Audit;
use App\Db;
use App\Request;
use App\Settings;
use App\Validator;

final class SettingsController
{
    public static function show(): array
    {
        $all = Settings::all();
        $out = [];
        foreach (array_keys(Settings::KEYS) as $k) {
            $out[$k] = $all[$k] ?? '';
        }
        return ['data' => $out];
    }

    public static function update(Request $req): array
    {
        $rules = [];
        foreach (Settings::KEYS as $k => $max) {
            $rules[$k] = ($k === 'receipt_terms' ? 'nullable|text' : 'nullable|string') . '|max:' . $max;
        }
        $d = Validator::validate($req->json(), $rules, true);
        if (isset($d['stale_days'])) {
            if (!ctype_digit((string) $d['stale_days']) || (int) $d['stale_days'] < 1 || (int) $d['stale_days'] > 60) {
                throw \App\HttpException::validation(['stale_days' => 'Enter a number of days between 1 and 60.']);
            }
        }
        if (array_key_exists('receipt_prefix', $d) && ($d['receipt_prefix'] === null || !preg_match('/^[A-Za-z0-9]{2,10}$/', $d['receipt_prefix']))) {
            throw \App\HttpException::validation(['receipt_prefix' => 'Use 2-10 letters/numbers (no spaces or slashes).']);
        }
        Db::tx(function () use ($d) {
            $before = Settings::all();
            foreach ($d as $k => $v) {
                Db::exec('INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)', [$k, (string) $v]);
            }
            [$old, $new] = \App\Audit::diff($before, array_map('strval', $d));
            if ($old !== [] || $new !== []) {
                Audit::log('update', 'settings', null, 'Settings updated', $old, $new);
            }
        });
        Settings::flush();
        return self::show();
    }

    /** Admin-only full database backup download (.sql.gz). */
    public static function backup(): never
    {
        Audit::log('backup', 'system', null, 'Database backup downloaded');
        $name = 'bea-backup-' . date('Ymd-His') . '.sql.gz';
        header('Content-Type: application/gzip');
        header('Content-Disposition: attachment; filename="' . $name . '"');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        $ctx = deflate_init(ZLIB_ENCODING_GZIP, ['level' => 6]);
        \App\Backup::dump(static function (string $s) use ($ctx): void {
            echo deflate_add($ctx, $s, ZLIB_NO_FLUSH);
        });
        echo deflate_add($ctx, '', ZLIB_FINISH);
        exit;
    }
}
