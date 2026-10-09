<?php
declare(strict_types=1);

namespace App;

final class Audit
{
    private static ?string $ip = null;

    public static function setIp(string $ip): void
    {
        self::$ip = $ip;
    }

    public static function log(string $action, string $entity, ?int $entityId, string $summary, ?array $old = null, ?array $new = null): void
    {
        Db::insert('audit_logs', [
            'user_id'     => Auth::id(),
            'action'      => $action,
            'entity_type' => $entity,
            'entity_id'   => $entityId,
            'summary'     => mb_substr($summary, 0, 255),
            'old_values'  => $old === null ? null : json_encode($old, JSON_UNESCAPED_UNICODE),
            'new_values'  => $new === null ? null : json_encode($new, JSON_UNESCAPED_UNICODE),
            'ip'          => self::$ip,
        ]);
    }

    /** Returns [old, new] containing only the keys whose value actually changed. */
    public static function diff(array $before, array $after): array
    {
        $old = [];
        $new = [];
        foreach ($after as $k => $v) {
            $b = $before[$k] ?? null;
            if ((string) $b !== (string) $v) {
                $old[$k] = $b;
                $new[$k] = $v;
            }
        }
        return [$old, $new];
    }
}
