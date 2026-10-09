<?php
declare(strict_types=1);

namespace App;

final class App
{
    public static function run(): never
    {
        error_reporting(E_ALL);
        ini_set('display_errors', '0');
        set_error_handler(static function (int $no, string $str, string $file, int $line): bool {
            if (!(error_reporting() & $no)) {
                return false;
            }
            throw new \ErrorException($str, 0, $no, $file, $line);
        });

        try {
            Config::load();
            $req = Request::capture();
            Audit::setIp($req->ip());

            $router = new Router();
            (require __DIR__ . '/routes.php')($router);
            $router->dispatch($req);
        } catch (HttpException $e) {
            Response::error($e);
        } catch (\Throwable $e) {
            Log::error(get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            $msg = 'Something went wrong on the server. Your data was not changed. Please try again.';
            Response::json(['error' => [
                'code' => 'server_error',
                'message' => Config::debug() ? $e->getMessage() : $msg,
            ]], 500);
        }
    }
}
