<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Audit;
use App\Auth;
use App\Db;
use App\Enums;
use App\HttpException;
use App\Request;
use App\Validator;

final class UserController
{
    private static function present(array $u): array
    {
        return [
            'id' => (int) $u['id'], 'name' => $u['name'], 'email' => $u['email'], 'phone' => $u['phone'],
            'role' => $u['role'], 'is_active' => (bool) $u['is_active'], 'last_login_at' => $u['last_login_at'],
        ];
    }

    public static function index(): array
    {
        return ['data' => array_map([self::class, 'present'], Db::all('SELECT * FROM users ORDER BY is_active DESC, name'))];
    }

    public static function store(Request $req): array
    {
        $d = Validator::validate($req->json(), [
            'name' => 'required|string|max:100', 'email' => 'required|email', 'phone' => 'nullable|phone',
            'role' => 'required|in:' . Enums::keys(Enums::ROLES),
        ]);
        $pw = (string) ($req->json()['password'] ?? '');
        if ($msg = Auth::checkPasswordStrength($pw)) {
            throw HttpException::validation(['password' => $msg]);
        }
        try {
            $id = Db::tx(function () use ($d, $pw) {
                $id = Db::insert('users', [
                    'name' => $d['name'], 'email' => $d['email'], 'phone' => $d['phone'], 'role' => $d['role'],
                    'password_hash' => password_hash($pw, PASSWORD_DEFAULT),
                ]);
                Audit::log('create', 'user', $id, "User created: {$d['email']} ({$d['role']})");
                return $id;
            });
        } catch (\PDOException $e) {
            if (Db::isDuplicate($e)) {
                throw HttpException::validation(['email' => 'A user with this email already exists.']);
            }
            throw $e;
        }
        return ['data' => self::present(Db::one('SELECT * FROM users WHERE id = ?', [$id])), '_status' => 201];
    }

    public static function update(Request $req, array $p): array
    {
        $d = Validator::validate($req->json(), [
            'name' => 'required|string|max:100', 'phone' => 'nullable|phone',
            'role' => 'required|in:' . Enums::keys(Enums::ROLES), 'is_active' => 'nullable|bool',
        ], true);
        Db::tx(function () use ($p, $d) {
            $cur = Db::one('SELECT * FROM users WHERE id = ? FOR UPDATE', [$p[0]]);
            if (!$cur) {
                throw new HttpException(404, 'User not found.');
            }
            $newRole = $d['role'] ?? $cur['role'];
            $newActive = array_key_exists('is_active', $d) ? (int) $d['is_active'] : (int) $cur['is_active'];
            if ($p[0] === Auth::id() && ($newRole !== 'admin' || !$newActive)) {
                throw new HttpException(409, 'You cannot remove your own admin access or deactivate yourself.');
            }
            if ($cur['role'] === 'admin' && ($newRole !== 'admin' || !$newActive)) {
                $others = (int) Db::val("SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = 1 AND id <> ?", [$p[0]]);
                if ($others === 0) {
                    throw new HttpException(409, 'At least one active admin is required.');
                }
            }
            [$old, $new] = Audit::diff($cur, $d);
            if ($old === []) {
                return;
            }
            Db::update('users', $p[0], $d);
            Audit::log('update', 'user', $p[0], "User updated: {$cur['email']}", $old, $new);
        });
        return ['data' => self::present(Db::one('SELECT * FROM users WHERE id = ?', [$p[0]]))];
    }

    public static function resetPassword(Request $req, array $p): array
    {
        $pw = (string) ($req->json()['password'] ?? '');
        if ($msg = Auth::checkPasswordStrength($pw)) {
            throw HttpException::validation(['password' => $msg]);
        }
        if (!Db::val('SELECT 1 FROM users WHERE id = ?', [$p[0]])) {
            throw new HttpException(404, 'User not found.');
        }
        Db::tx(function () use ($p, $pw) {
            Db::exec('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), $p[0]]);
            Audit::log('password_reset', 'user', $p[0], 'Password reset by admin');
        });
        return ['data' => ['ok' => true]];
    }
}
