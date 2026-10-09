<?php
/**
 * One-time web installer. Open https://YOUR-SITE/dashboard/api/setup.php once, create the first admin,
 * then DELETE this file from the server. It locks itself after a successful run.
 */
declare(strict_types=1);

require __DIR__ . '/src/bootstrap.php';

use App\Config;
use App\HttpException;
use App\Installer;

header('Content-Type: text/html; charset=utf-8');
header('X-Frame-Options: DENY');
header('Cache-Control: no-store');
$h = static fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
$msg = '';
$ok = [];
$keyOk = false;

try {
    Config::load();
    $key = (string) Config::get('app.setup_key', '');
    $keyOk = strlen($key) >= 12 && $key !== 'CHANGE-ME-TO-A-LONG-RANDOM-TEXT';

    if (Installer::isLocked()) {
        $msg = 'Setup is already completed. Please delete setup.php from the server.';
    } elseif (!$keyOk) {
        $msg = 'Open config.php and set app.setup_key to a long random text (at least 12 characters).';
    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!hash_equals($key, (string) ($_POST['setup_key'] ?? ''))) {
            usleep(800000);
            throw new HttpException(403, 'Wrong setup key.');
        }
        $ok = Installer::run((string) ($_POST['name'] ?? ''), (string) ($_POST['email'] ?? ''), (string) ($_POST['password'] ?? ''));
    }
} catch (HttpException $e) {
    $msg = $e->getMessage() . ($e->fields ? ' ' . implode(' ', $e->fields) : '');
} catch (Throwable $e) {
    App\Log::error('setup: ' . $e->getMessage());
    $msg = 'Setup failed: ' . (Config::debug() ? $e->getMessage() : 'check database details in config.php.');
}
?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Setup - Brahma English Academy</title>
<style>body{font-family:system-ui,sans-serif;background:#eef3fb;margin:0;display:grid;place-items:center;min-height:100vh}
.card{background:#fff;border-radius:14px;padding:28px;max-width:420px;width:92%;box-shadow:0 8px 30px rgba(20,60,120,.15)}
h1{font-size:20px;margin:0 0 4px;color:#0f5a82}label{display:block;margin-top:14px;font-size:13px;font-weight:600}
input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #c5d0e0;border-radius:8px;margin-top:4px;font-size:15px}
button{margin-top:20px;width:100%;padding:12px;background:#2a60ad;color:#fff;border:0;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer}
.err{background:#fde8e8;color:#9b1c1c;padding:10px;border-radius:8px;margin-top:12px}.ok{background:#e6f6ec;color:#0f5132;padding:10px;border-radius:8px;margin-top:12px}</style></head>
<body><div class="card"><h1>Brahma English Academy</h1><div>Dashboard setup</div>
<?php if ($msg): ?><div class="err"><?= $h($msg) ?></div><?php endif; ?>
<?php if ($ok): ?><div class="ok"><?php foreach ($ok as $l) { echo $h($l), '<br>'; } ?><br><strong>Important:</strong> now delete <code>setup.php</code> from the server, then log in at your dashboard URL.</div>
<?php elseif ($keyOk && !Installer::isLocked()): ?>
<form method="post" autocomplete="off">
<label>Setup key (from config.php)<input type="password" name="setup_key" required></label>
<label>Admin name<input name="name" required maxlength="100"></label>
<label>Admin email (login)<input type="email" name="email" required></label>
<label>Admin password (min 8, letters + numbers)<input type="password" name="password" required minlength="8"></label>
<button type="submit">Install</button></form>
<?php endif; ?></div></body></html>
