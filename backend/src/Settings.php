<?php
declare(strict_types=1);

namespace App;

final class Settings
{
    public const KEYS = [
        'academy_name' => 100, 'academy_tagline' => 150, 'academy_address' => 300, 'academy_phone' => 60,
        'academy_email' => 150, 'academy_website' => 150, 'academy_gstin' => 20,
        'receipt_prefix' => 10, 'receipt_terms' => 1000, 'stale_days' => 3,
    ];

    private static ?array $cache = null;

    public static function all(): array
    {
        if (self::$cache === null) {
            self::$cache = [];
            foreach (Db::all('SELECT `key`, `value` FROM settings') as $r) {
                self::$cache[$r['key']] = (string) $r['value'];
            }
        }
        return self::$cache;
    }

    public static function get(string $key, string $default = ''): string
    {
        return self::all()[$key] ?? $default;
    }

    public static function staleDays(): int
    {
        return max(1, min(60, (int) self::get('stale_days', '7')));
    }

    public static function flush(): void
    {
        self::$cache = null;
    }
}
