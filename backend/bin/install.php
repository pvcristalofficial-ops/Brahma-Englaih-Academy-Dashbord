<?php
// CLI installer:  php bin/install.php --name="Owner" --email=you@example.com --password='Str0ngPass'
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit('CLI only.');
}
require dirname(__DIR__) . '/src/bootstrap.php';

$o = getopt('', ['name:', 'email:', 'password:']);
if (!isset($o['name'], $o['email'], $o['password'])) {
    fwrite(STDERR, "Usage: php bin/install.php --name=\"Owner\" --email=you@example.com --password='Str0ngPass1'\n");
    exit(1);
}
try {
    App\Config::load();
    foreach (App\Installer::run($o['name'], $o['email'], $o['password'], true) as $line) {
        echo $line, PHP_EOL;
    }
} catch (Throwable $e) {
    fwrite(STDERR, 'Install failed: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
