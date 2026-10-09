<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Audit;
use App\Db;
use App\HttpException;
use App\Request;
use App\Validator;

final class CourseController
{
    private static function present(array $c): array
    {
        return ['id' => (int) $c['id'], 'name' => $c['name'], 'fee' => (float) $c['fee'], 'duration' => $c['duration'], 'is_active' => (bool) $c['is_active']];
    }

    public static function index(): array
    {
        $rows = Db::all('SELECT * FROM courses ORDER BY is_active DESC, name');
        return ['data' => array_map([self::class, 'present'], $rows)];
    }

    private static function rules(): array
    {
        return ['name' => 'required|string|max:120', 'fee' => 'required|money', 'duration' => 'nullable|string|max:60', 'is_active' => 'nullable|bool'];
    }

    public static function store(Request $req): array
    {
        $d = Validator::validate($req->json(), self::rules());
        try {
            $id = Db::tx(function () use ($d) {
                $id = Db::insert('courses', ['name' => $d['name'], 'fee' => $d['fee'], 'duration' => $d['duration'], 'is_active' => $d['is_active'] ?? 1]);
                Audit::log('create', 'course', $id, "Course added: {$d['name']}");
                return $id;
            });
        } catch (\PDOException $e) {
            if (Db::isDuplicate($e)) {
                throw HttpException::validation(['name' => 'A course with this name already exists.']);
            }
            throw $e;
        }
        return ['data' => self::present(Db::one('SELECT * FROM courses WHERE id = ?', [$id])), '_status' => 201];
    }

    public static function update(Request $req, array $p): array
    {
        $d = Validator::validate($req->json(), self::rules(), true);
        try {
            Db::tx(function () use ($p, $d) {
                $cur = Db::one('SELECT * FROM courses WHERE id = ? FOR UPDATE', [$p[0]]);
                if (!$cur) {
                    throw new HttpException(404, 'Course not found.');
                }
                [$old, $new] = Audit::diff($cur, $d);
                if ($old === []) {
                    return;
                }
                Db::update('courses', $p[0], $d);
                Audit::log('update', 'course', $p[0], "Course updated: {$cur['name']}", $old, $new);
            });
        } catch (\PDOException $e) {
            if (Db::isDuplicate($e)) {
                throw HttpException::validation(['name' => 'A course with this name already exists.']);
            }
            throw $e;
        }
        return ['data' => self::present(Db::one('SELECT * FROM courses WHERE id = ?', [$p[0]]))];
    }
}
