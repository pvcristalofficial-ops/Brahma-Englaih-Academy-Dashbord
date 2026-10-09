<?php
declare(strict_types=1);

namespace App;

final class Installer
{
    public static function lockFile(): string
    {
        return APP_ROOT . '/storage/setup.lock';
    }

    public static function isLocked(): bool
    {
        return is_file(self::lockFile());
    }

    /** Create tables (idempotent) and the first admin. Returns human-readable log lines. */
    public static function run(string $name, string $email, string $password, bool $force = false): array
    {
        if (self::isLocked() && !$force) {
            throw new HttpException(409, 'Setup has already been completed.');
        }
        $email = strtolower(trim($email));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw HttpException::validation(['email' => 'Enter a valid email address.']);
        }
        if ($msg = Auth::checkPasswordStrength($password)) {
            throw HttpException::validation(['password' => $msg]);
        }
        if (trim($name) === '') {
            throw HttpException::validation(['name' => 'Name is required.']);
        }

        $log = [];
        $sql = (string) file_get_contents(APP_ROOT . '/database/schema.sql');
        $sql = preg_replace('/^\s*--.*$/m', '', $sql) ?? '';
        $pdo = Db::pdo();
        $n = 0;
        foreach (preg_split('/;\s*[\r\n]+/', $sql) ?: [] as $stmt) {
            $stmt = trim($stmt);
            if ($stmt !== '') {
                $pdo->exec($stmt);
                $n++;
            }
        }
        $log[] = "Database tables ready ($n statements).";

        if ((int) Db::val('SELECT COUNT(*) FROM users') === 0) {
            Db::insert('users', [
                'name' => trim($name), 'email' => $email,
                'password_hash' => password_hash($password, PASSWORD_DEFAULT), 'role' => 'admin',
            ]);
            $log[] = "Admin user created: $email";
        } else {
            $log[] = 'Users already exist - admin not changed.';
        }
        @file_put_contents(self::lockFile(), 'installed ' . date('c'));
        return $log;
    }
}
