<?php
declare(strict_types=1);

namespace App;

/** Pure-PHP SQL dump (works on shared hosting without mysqldump / exec). */
final class Backup
{
    private const SKIP = ['rate_limits'];

    /** @param callable(string):void $write */
    public static function dump(callable $write): void
    {
        $pdo = Db::pdo();
        $write("-- Brahma English Academy backup\n-- Created: " . date('Y-m-d H:i:s') . "\n");
        $write("SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\nSET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';\n\n");

        $tables = $pdo->query('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"')->fetchAll(\PDO::FETCH_NUM);
        foreach ($tables as [$table]) {
            if (in_array($table, self::SKIP, true)) {
                continue;
            }
            $create = $pdo->query("SHOW CREATE TABLE `$table`")->fetch(\PDO::FETCH_NUM)[1];
            $write("DROP TABLE IF EXISTS `$table`;\n$create;\n\n");

            $cols = $pdo->query("SHOW COLUMNS FROM `$table`")->fetchAll(\PDO::FETCH_COLUMN);
            $colList = implode(',', array_map(static fn ($c) => "`$c`", $cols));
            $offset = 0;
            $chunk = 500;
            do {
                $rows = $pdo->query("SELECT * FROM `$table` ORDER BY 1 LIMIT $chunk OFFSET $offset")->fetchAll(\PDO::FETCH_NUM);
                if ($rows) {
                    $vals = [];
                    foreach ($rows as $row) {
                        $vals[] = '(' . implode(',', array_map(static fn ($v) => $v === null ? 'NULL' : $pdo->quote((string) $v), $row)) . ')';
                    }
                    $write("INSERT INTO `$table` ($colList) VALUES\n" . implode(",\n", $vals) . ";\n");
                }
                $offset += $chunk;
            } while (count($rows) === $chunk);
            $write("\n");
        }
        $write("SET FOREIGN_KEY_CHECKS=1;\n-- End of backup\n");
    }

    /** Write a gzip backup file and keep only the newest $keep files. Returns the file path. */
    public static function toFile(int $keep = 30): string
    {
        $dir = APP_ROOT . '/storage/backups';
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new \RuntimeException('Cannot create backup directory.');
        }
        $file = $dir . '/bea-backup-' . date('Ymd-His') . '.sql.gz';
        $gz = gzopen($file, 'wb9');
        if ($gz === false) {
            throw new \RuntimeException('Cannot write backup file.');
        }
        self::dump(static function (string $s) use ($gz): void {
            gzwrite($gz, $s);
        });
        gzclose($gz);
        $all = glob($dir . '/bea-backup-*.sql.gz') ?: [];
        sort($all);
        foreach (array_slice($all, 0, max(0, count($all) - $keep)) as $old) {
            @unlink($old);
        }
        return $file;
    }
}
