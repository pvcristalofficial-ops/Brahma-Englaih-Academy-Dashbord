<?php
declare(strict_types=1);

namespace App;

final class Config
{
    private static ?array $data = null;

    public static function load(?string $file = null): void
    {
        $file ??= APP_ROOT . '/config.php';
        if (!is_file($file)) {
            throw new HttpException(503, 'config.php not found. Copy config.sample.php to config.php and fill in your database details.');
        }
        $cfg = require $file;
        if (!is_array($cfg)) {
            throw new HttpException(503, 'config.php must return an array.');
        }
        self::$data = $cfg;
        date_default_timezone_set((string) self::get('app.timezone', 'Asia/Kolkata'));
    }

    public static function get(string $path, mixed $default = null): mixed
    {
        if (self::$data === null) {
            self::load();
        }
        $cur = self::$data;
        foreach (explode('.', $path) as $part) {
            if (!is_array($cur) || !array_key_exists($part, $cur)) {
                return $default;
            }
            $cur = $cur[$part];
        }
        return $cur;
    }

    public static function debug(): bool
    {
        return (bool) self::get('app.debug', false);
    }
}
