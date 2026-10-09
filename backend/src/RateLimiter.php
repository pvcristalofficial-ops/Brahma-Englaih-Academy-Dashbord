<?php
declare(strict_types=1);

namespace App;

final class RateLimiter
{
    public static function hit(string $key, int $windowSeconds): int
    {
        $key = substr($key, 0, 150);
        // `hits` is assigned before `window_start` so it reads the old window start (MySQL evaluates left to right).
        Db::exec(
            'INSERT INTO rate_limits (k, hits, window_start) VALUES (?, 1, NOW())
             ON DUPLICATE KEY UPDATE
               hits = IF(window_start < (NOW() - INTERVAL ? SECOND), 1, hits + 1),
               window_start = IF(window_start < (NOW() - INTERVAL ? SECOND), NOW(), window_start)',
            [$key, $windowSeconds, $windowSeconds]
        );
        return self::count($key, $windowSeconds);
    }

    public static function count(string $key, int $windowSeconds): int
    {
        $v = Db::val(
            'SELECT hits FROM rate_limits WHERE k = ? AND window_start >= (NOW() - INTERVAL ? SECOND)',
            [substr($key, 0, 150), $windowSeconds]
        );
        return (int) $v;
    }

    public static function clear(string $key): void
    {
        Db::exec('DELETE FROM rate_limits WHERE k = ?', [substr($key, 0, 150)]);
    }

    public static function enforce(string $key, int $max, int $windowSeconds, string $message = 'Too many requests. Please try again later.'): void
    {
        if (self::hit($key, $windowSeconds) > $max) {
            throw new HttpException(429, $message);
        }
    }
}
