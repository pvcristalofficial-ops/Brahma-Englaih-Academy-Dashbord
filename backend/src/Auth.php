<?php
declare(strict_types=1);

namespace App;

final class Auth
{
    private const IDLE_TIMEOUT = 28800; // 8 hours of inactivity
    private static ?array $user = null;

    public static function startSession(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        $dir = APP_ROOT . '/storage/sessions';
        if (is_dir($dir) && is_writable($dir)) {
            session_save_path($dir);
        }
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https' && Config::get('app.trust_proxy', false));
        session_name('BEASESS');
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'secure'   => $https,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.gc_maxlifetime', (string) self::IDLE_TIMEOUT);
        session_start();
    }

    /** Current user row (without password hash) or null. Re-read every request so deactivation is instant. */
    public static function user(): ?array
    {
        if (self::$user !== null) {
            return self::$user;
        }
        self::startSession();
        $id = $_SESSION['uid'] ?? null;
        if (!$id) {
            return null;
        }
        if (time() - (int) ($_SESSION['last'] ?? 0) > self::IDLE_TIMEOUT) {
            self::logout();
            return null;
        }
        $u = Db::one('SELECT id, name, email, phone, role, is_active FROM users WHERE id = ?', [(int) $id]);
        if (!$u || !(int) $u['is_active']) {
            self::logout();
            return null;
        }
        $_SESSION['last'] = time();
        $u['id'] = (int) $u['id'];
        return self::$user = $u;
    }

    public static function requireUser(): array
    {
        $u = self::user();
        if (!$u) {
            throw new HttpException(401, 'Please log in.');
        }
        return $u;
    }

    public static function id(): ?int
    {
        return self::$user['id'] ?? null;
    }

    public static function isAdmin(): bool
    {
        return (self::user()['role'] ?? '') === 'admin';
    }

    public static function csrfToken(): string
    {
        self::startSession();
        if (empty($_SESSION['csrf'])) {
            $_SESSION['csrf'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['csrf'];
    }

    public static function verifyCsrf(Request $req): void
    {
        $sent = (string) $req->header('x-csrf-token');
        if ($sent === '' || !hash_equals(self::csrfToken(), $sent)) {
            throw new HttpException(403, 'Session expired. Please refresh the page and try again.', [], 'csrf_failed');
        }
    }

    public static function attempt(Request $req, string $email, string $password): array
    {
        $email = strtolower(trim($email));
        $ip = $req->ip();
        if (RateLimiter::count("login:ip:$ip", 900) >= 30 || RateLimiter::count('login:acct:' . $email, 900) >= 5) {
            throw new HttpException(429, 'Too many failed attempts. Please wait 15 minutes and try again.');
        }

        $row = Db::one('SELECT * FROM users WHERE email = ?', [$email]);
        // Always run a hash verification so response time does not reveal whether the email exists.
        $hash = $row['password_hash'] ?? '$2y$10$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG';
        $ok = password_verify($password, $hash);

        if (!$row || !$ok || !(int) $row['is_active']) {
            RateLimiter::hit("login:ip:$ip", 900);
            RateLimiter::hit('login:acct:' . $email, 900);
            throw new HttpException(401, 'Incorrect email or password.');
        }

        if (password_needs_rehash($row['password_hash'], PASSWORD_DEFAULT)) {
            Db::exec('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $row['id']]);
        }
        RateLimiter::clear('login:acct:' . $email);

        self::startSession();
        session_regenerate_id(true);
        $_SESSION['uid'] = (int) $row['id'];
        $_SESSION['last'] = time();
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        Db::exec('UPDATE users SET last_login_at = NOW() WHERE id = ?', [$row['id']]);
        self::$user = null;
        $user = self::requireUser();
        Audit::log('login', 'user', $user['id'], 'Logged in');
        return $user;
    }

    public static function logout(): void
    {
        self::startSession();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => $p['path'], 'secure' => $p['secure'], 'httponly' => true, 'samesite' => 'Lax']);
        }
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_destroy();
        }
        self::$user = null;
    }

    public static function checkPasswordStrength(string $pw): ?string
    {
        if (strlen($pw) < 8) {
            return 'Password must be at least 8 characters.';
        }
        if (!preg_match('/[A-Za-z]/', $pw) || !preg_match('/\d/', $pw)) {
            return 'Password must contain at least one letter and one number.';
        }
        return null;
    }
}
