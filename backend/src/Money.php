<?php
declare(strict_types=1);

namespace App;

/** Money is handled as integer paise internally so float rounding can never corrupt a balance. */
final class Money
{
    public static function paise(string|int|float|null $v): int
    {
        return (int) round(((float) $v) * 100);
    }

    public static function fmt(int $paise): string
    {
        return number_format($paise / 100, 2, '.', '');
    }
}
