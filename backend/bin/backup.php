<?php
// Daily backup (add to cPanel Cron Jobs):  php /home/USER/public_html/dashboard/api/bin/backup.php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit('CLI only.');
}
require dirname(__DIR__) . '/src/bootstrap.php';

try {
    App\Config::load();
    $file = App\Backup::toFile(30);
    echo 'Backup saved: ', $file, ' (', number_format((int) filesize($file)), " bytes)\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'Backup failed: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
