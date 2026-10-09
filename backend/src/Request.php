<?php
declare(strict_types=1);

namespace App;

final class Request
{
    private ?array $json = null;

    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $query,
        private readonly string $rawBody,
        private readonly array $headers,
        private readonly array $server,
        private readonly array $post = []
    ) {
    }

    public static function capture(): self
    {
        $uri = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
        $path = self::routePath($uri);
        $headers = [];
        foreach ($_SERVER as $k => $v) {
            if (str_starts_with($k, 'HTTP_')) {
                $headers[strtolower(str_replace('_', '-', substr($k, 5)))] = (string) $v;
            }
        }
        if (isset($_SERVER['CONTENT_TYPE'])) {
            $headers['content-type'] = (string) $_SERVER['CONTENT_TYPE'];
        }
        $raw = (string) file_get_contents('php://input', false, null, 0, 1048577);
        return new self(
            strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'),
            $path,
            $_GET,
            $raw,
            $headers,
            $_SERVER,
            $_POST
        );
    }

    /** Works behind Apache rewrite (/dashboard/api/auth/login), PATH_INFO and the PHP dev server. */
    private static function routePath(string $uri): string
    {
        if (!empty($_SERVER['PATH_INFO'])) {
            return '/' . trim((string) $_SERVER['PATH_INFO'], '/');
        }
        $script = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));
        $base = rtrim(str_replace('\\', '/', dirname($script)), '/');
        if ($base !== '' && $base !== '.' && str_starts_with($uri, $base . '/')) {
            $uri = substr($uri, strlen($base));
        } elseif (str_starts_with($uri, $script) && $script !== '') {
            $uri = substr($uri, strlen($script));
        }
        $uri = '/' . trim($uri, '/');
        return $uri === '/index.php' ? '/' : $uri;
    }

    public function header(string $name): ?string
    {
        return $this->headers[strtolower($name)] ?? null;
    }

    public function ip(): string
    {
        if (Config::get('app.trust_proxy', false) && !empty($this->server['HTTP_X_FORWARDED_FOR'])) {
            $first = trim(explode(',', (string) $this->server['HTTP_X_FORWARDED_FOR'])[0]);
            if (filter_var($first, FILTER_VALIDATE_IP)) {
                return $first;
            }
        }
        return (string) ($this->server['REMOTE_ADDR'] ?? '0.0.0.0');
    }

    public function isJson(): bool
    {
        return stripos((string) $this->header('content-type'), 'application/json') !== false;
    }

    /** Parsed JSON body. Non-JSON mutating requests are rejected (also blocks classic form-CSRF). */
    public function json(bool $allowForm = false): array
    {
        if ($this->json !== null) {
            return $this->json;
        }
        if ($this->rawBody === '' ) {
            return $this->json = $allowForm ? $this->post : [];
        }
        if (strlen($this->rawBody) > 1048576) {
            throw new HttpException(413, 'Request too large.');
        }
        if (!$this->isJson()) {
            if ($allowForm) {
                return $this->json = $this->post;
            }
            throw new HttpException(415, 'Content-Type must be application/json.');
        }
        $data = json_decode($this->rawBody, true);
        if (!is_array($data)) {
            throw new HttpException(400, 'Invalid JSON body.');
        }
        return $this->json = $data;
    }

    public function q(string $key, ?string $default = null): ?string
    {
        $v = $this->query[$key] ?? $default;
        return is_string($v) ? trim($v) : $default;
    }

    public function qInt(string $key, int $default, int $min = 1, int $max = PHP_INT_MAX): int
    {
        $v = $this->query[$key] ?? null;
        if (!is_string($v) || !preg_match('/^-?\d+$/', $v)) {
            return $default;
        }
        return max($min, min($max, (int) $v));
    }
}
