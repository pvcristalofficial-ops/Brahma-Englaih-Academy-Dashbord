<?php
declare(strict_types=1);

namespace App;

final class Response
{
    public static function headers(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: same-origin');
        header('Cache-Control: no-store');
        header('Cross-Origin-Resource-Policy: same-origin');
    }

    public static function json(mixed $payload, int $status = 200): never
    {
        http_response_code($status);
        self::headers();
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
        exit;
    }

    public static function error(HttpException $e): never
    {
        $body = ['error' => ['code' => $e->errorCode ?: self::codeFor($e->status), 'message' => $e->getMessage()]];
        if ($e->fields) {
            $body['error']['fields'] = $e->fields;
        }
        foreach ($e->extra as $k => $v) {
            $body['error'][$k] = $v;
        }
        self::json($body, $e->status);
    }

    private static function codeFor(int $status): string
    {
        return match ($status) {
            400 => 'bad_request', 401 => 'unauthenticated', 403 => 'forbidden', 404 => 'not_found',
            405 => 'method_not_allowed', 409 => 'conflict', 413 => 'too_large', 415 => 'unsupported_media_type',
            422 => 'validation_failed', 429 => 'too_many_requests', 503 => 'unavailable',
            default => 'error',
        };
    }
}
