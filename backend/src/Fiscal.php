<?php
declare(strict_types=1);

namespace App;

final class Fiscal
{
    /** Indian financial year label, e.g. 2026-27 for any date between 1 Apr 2026 and 31 Mar 2027. */
    public static function label(?\DateTimeInterface $d = null): string
    {
        $d ??= new \DateTimeImmutable('now');
        $y = (int) $d->format('Y');
        $start = ((int) $d->format('n') >= 4) ? $y : $y - 1;
        return sprintf('%d-%02d', $start, ($start + 1) % 100);
    }

    public static function number(string $prefix, string $kind, int $seq, ?string $fy = null): string
    {
        $fy ??= self::label();
        return $kind === ''
            ? sprintf('%s/%s/%04d', $prefix, $fy, $seq)
            : sprintf('%s/%s/%s/%04d', $prefix, $kind, $fy, $seq);
    }
}
