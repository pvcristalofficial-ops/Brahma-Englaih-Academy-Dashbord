<?php
declare(strict_types=1);

namespace App;

final class Router
{
    /** @var array<int, array{method:string, regex:string, handler:callable, opts:array}> */
    private array $routes = [];

    public function add(string $method, string $pattern, callable $handler, array $opts = []): void
    {
        $regex = '#^' . preg_replace(['#\{id\}#', '#\{(\w+)\}#'], ['(\d+)', '([A-Za-z0-9_-]+)'], $pattern) . '$#';
        $this->routes[] = ['method' => $method, 'regex' => $regex, 'handler' => $handler, 'opts' => $opts];
    }

    public function dispatch(Request $req): never
    {
        $allowed = [];
        foreach ($this->routes as $r) {
            if (!preg_match($r['regex'], $req->path, $m)) {
                continue;
            }
            if ($r['method'] !== $req->method) {
                $allowed[] = $r['method'];
                continue;
            }
            array_shift($m);
            $opts = $r['opts'];

            if (($opts['auth'] ?? true) === true) {
                $user = Auth::requireUser();
                if (isset($opts['roles']) && !in_array($user['role'], $opts['roles'], true)) {
                    throw new HttpException(403, 'You do not have permission to do this.');
                }
                if ($req->method !== 'GET' && ($opts['csrf'] ?? true)) {
                    Auth::verifyCsrf($req);
                }
            }

            // Numeric path captures (ids) are handed to handlers as ints.
            $params = array_map(static fn (string $v) => ctype_digit($v) ? (int) $v : $v, $m);
            $result = ($r['handler'])($req, $params) ?? ['data' => null];
            $status = 200;
            if (isset($result['_status'])) {
                $status = (int) $result['_status'];
                unset($result['_status']);
            }
            Response::json($result, $status);
        }
        if ($allowed) {
            throw new HttpException(405, 'Method not allowed.');
        }
        throw new HttpException(404, 'Endpoint not found.');
    }
}
