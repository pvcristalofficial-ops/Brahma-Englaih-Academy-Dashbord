<?php
declare(strict_types=1);

namespace App;

use PDO;
use PDOException;

/**
 * Thin PDO wrapper. All queries are prepared statements (no string-built SQL with user data).
 * Strict SQL mode is forced so MySQL can never silently truncate or coerce data.
 */
final class Db
{
    private static ?PDO $pdo = null;
    private static int $depth = 0;

    public static function pdo(): PDO
    {
        if (self::$pdo === null) {
            $c = Config::get('db');
            if (!is_array($c)) {
                throw new HttpException(503, 'Database is not configured.');
            }
            $dsn = sprintf(
                'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
                $c['host'] ?? 'localhost',
                (int) ($c['port'] ?? 3306),
                $c['name'] ?? ''
            );
            $offset = (new \DateTimeImmutable('now'))->format('P');
            try {
                self::$pdo = new PDO($dsn, (string) ($c['user'] ?? ''), (string) ($c['pass'] ?? ''), [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                    PDO::MYSQL_ATTR_INIT_COMMAND =>
                        "SET NAMES utf8mb4, time_zone = '{$offset}', "
                        . "sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'",
                ]);
            } catch (PDOException $e) {
                Log::error('DB connection failed: ' . $e->getMessage());
                throw new HttpException(503, 'Database connection failed. Please check config.php.');
            }
        }
        return self::$pdo;
    }

    public static function all(string $sql, array $params = []): array
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($params);
        return $st->fetchAll();
    }

    public static function one(string $sql, array $params = []): ?array
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($params);
        $row = $st->fetch();
        return $row === false ? null : $row;
    }

    public static function val(string $sql, array $params = []): mixed
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($params);
        $v = $st->fetchColumn();
        return $v === false ? null : $v;
    }

    public static function exec(string $sql, array $params = []): int
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($params);
        return $st->rowCount();
    }

    /** INSERT from an associative array; returns the new auto-increment id. */
    public static function insert(string $table, array $data): int
    {
        $cols = array_keys($data);
        $sql = sprintf(
            'INSERT INTO `%s` (%s) VALUES (%s)',
            $table,
            implode(',', array_map(static fn ($c) => "`$c`", $cols)),
            implode(',', array_fill(0, count($cols), '?'))
        );
        self::exec($sql, array_values($data));
        return (int) self::pdo()->lastInsertId();
    }

    /** UPDATE ... WHERE id = ? from an associative array. */
    public static function update(string $table, int $id, array $data): int
    {
        if ($data === []) {
            return 0;
        }
        $set = implode(',', array_map(static fn ($c) => "`$c` = ?", array_keys($data)));
        return self::exec("UPDATE `$table` SET $set WHERE id = ?", [...array_values($data), $id]);
    }

    /**
     * Run $fn inside a transaction. Retries on deadlock / lock-wait timeout.
     * Nested calls join the outer transaction.
     */
    public static function tx(callable $fn): mixed
    {
        if (self::$depth > 0) {
            return $fn();
        }
        $attempts = 0;
        while (true) {
            $attempts++;
            self::pdo()->beginTransaction();
            self::$depth = 1;
            try {
                $result = $fn();
                self::pdo()->commit();
                self::$depth = 0;
                return $result;
            } catch (\Throwable $e) {
                if (self::pdo()->inTransaction()) {
                    self::pdo()->rollBack();
                }
                self::$depth = 0;
                $code = $e instanceof PDOException ? (int) ($e->errorInfo[1] ?? 0) : 0;
                if (($code === 1213 || $code === 1205) && $attempts < 3) {
                    usleep(random_int(50, 200) * 1000);
                    continue;
                }
                throw $e;
            }
        }
    }

    public static function isDuplicate(\Throwable $e): bool
    {
        return $e instanceof PDOException && (int) ($e->errorInfo[1] ?? 0) === 1062;
    }

    /** Which unique key fired, e.g. "uq_enquiries_phone". */
    public static function duplicateKey(\Throwable $e): string
    {
        if (preg_match("/for key '(?:[^']*\\.)?([^']+)'/", $e->getMessage(), $m)) {
            return $m[1];
        }
        return '';
    }

    /** Atomic, gap-free counter (increment is rolled back with the surrounding transaction). */
    public static function nextCounter(string $name): int
    {
        self::exec(
            'INSERT INTO counters (name, value) VALUES (?, LAST_INSERT_ID(1))
             ON DUPLICATE KEY UPDATE value = LAST_INSERT_ID(value + 1)',
            [$name]
        );
        return (int) self::val('SELECT LAST_INSERT_ID()');
    }
}
