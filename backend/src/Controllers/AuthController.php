<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Audit;
use App\Auth;
use App\Db;
use App\HttpException;
use App\Request;
use App\Validator;

final class AuthController
{
    public static function login(Request $req): array
    {
        $d = Validator::validate($req->json(), ['email' => 'required|string|max:190', 'password' => 'required|string|max:200']);
        // password is validated as a string but must NOT be trimmed/normalised: read the raw value.
        $raw = (string) ($req->json()['password'] ?? '');
        $user = Auth::attempt($req, $d['email'], $raw);
        return ['data' => ['user' => $user, 'csrf' => Auth::csrfToken()]];
    }

    public static function me(): array
    {
        $u = Auth::user();
        if (!$u) {
            throw new HttpException(401, 'Please log in.');
        }
        return ['data' => ['user' => $u, 'csrf' => Auth::csrfToken()]];
    }

    public static function logout(): array
    {
        Auth::logout();
        return ['data' => ['ok' => true]];
    }

    public static function changePassword(Request $req): array
    {
        $in = $req->json();
        $cur = (string) ($in['current_password'] ?? '');
        $new = (string) ($in['new_password'] ?? '');
        $u = Auth::requireUser();
        $row = Db::one('SELECT password_hash FROM users WHERE id = ?', [$u['id']]);
        if (!$row || !password_verify($cur, $row['password_hash'])) {
            throw HttpException::validation(['current_password' => 'Current password is incorrect.']);
        }
        if ($msg = Auth::checkPasswordStrength($new)) {
            throw HttpException::validation(['new_password' => $msg]);
        }
        if ($new === $cur) {
            throw HttpException::validation(['new_password' => 'New password must be different.']);
        }
        Db::exec('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), $u['id']]);
        Audit::log('password_change', 'user', $u['id'], 'Password changed');
        session_regenerate_id(true);
        return ['data' => ['ok' => true]];
    }
}
