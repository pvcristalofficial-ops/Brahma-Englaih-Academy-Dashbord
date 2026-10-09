<?php
declare(strict_types=1);

namespace App;

/**
 * Rule syntax: 'field' => 'required|string|max:100'
 * Types: string, text, int, money, date, time, email, phone, bool, in:a,b,c
 * Only fields listed in $rules are returned (no mass-assignment of unexpected columns).
 */
final class Validator
{
    public static function validate(array $in, array $rules, bool $partial = false): array
    {
        $out = [];
        $errors = [];

        foreach ($rules as $field => $spec) {
            $parts = explode('|', $spec);
            $present = array_key_exists($field, $in);
            if (!$present && $partial) {
                continue;
            }
            $raw = $present ? $in[$field] : null;
            if (is_string($raw)) {
                $raw = trim($raw);
            }
            $required = in_array('required', $parts, true);

            if ($raw === null || $raw === '') {
                if ($required) {
                    $errors[$field] = 'This field is required.';
                } else {
                    $out[$field] = null;
                }
                continue;
            }
            if (!is_scalar($raw)) {
                $errors[$field] = 'Invalid value.';
                continue;
            }

            $type = 'string';
            $max = null;
            $min = null;
            $enum = null;
            foreach ($parts as $p) {
                if (in_array($p, ['string', 'text', 'int', 'money', 'date', 'time', 'email', 'phone', 'bool'], true)) {
                    $type = $p;
                } elseif (str_starts_with($p, 'max:')) {
                    $max = (int) substr($p, 4);
                } elseif (str_starts_with($p, 'min:')) {
                    $min = (int) substr($p, 4);
                } elseif (str_starts_with($p, 'in:')) {
                    $enum = explode(',', substr($p, 3));
                    $type = 'in';
                }
            }

            $v = self::cast($type, $raw, $max, $min, $enum, $err);
            if ($err !== null) {
                $errors[$field] = $err;
            } else {
                $out[$field] = $v;
            }
        }

        if ($errors) {
            throw HttpException::validation($errors);
        }
        return $out;
    }

    private static function cast(string $type, mixed $raw, ?int $max, ?int $min, ?array $enum, ?string &$err): mixed
    {
        $err = null;
        $s = (string) $raw;
        switch ($type) {
            case 'string':
            case 'text':
                $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s) ?? '';
                if ($type === 'string') {
                    $s = trim((string) preg_replace('/\s+/u', ' ', $s));
                }
                if ($max !== null && mb_strlen($s) > $max) {
                    $err = "Maximum $max characters allowed.";
                } elseif ($min !== null && mb_strlen($s) < $min) {
                    $err = "Minimum $min characters required.";
                }
                return $s;
            case 'int':
                if (!preg_match('/^\d{1,12}$/', $s)) {
                    $err = 'Must be a whole number.';
                    return null;
                }
                return (int) $s;
            case 'money':
                if (!preg_match('/^\d{1,8}(\.\d{1,2})?$/', $s)) {
                    $err = 'Enter a valid amount (max 2 decimals).';
                    return null;
                }
                return number_format((float) $s, 2, '.', '');
            case 'date':
                $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $s);
                if (!$d || $d->format('Y-m-d') !== $s || (int) $d->format('Y') < 2000 || (int) $d->format('Y') > 2100) {
                    $err = 'Enter a valid date (YYYY-MM-DD).';
                    return null;
                }
                return $s;
            case 'time':
                if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/', $s)) {
                    $err = 'Enter a valid time (HH:MM).';
                    return null;
                }
                return strlen($s) === 5 ? $s . ':00' : $s;
            case 'email':
                if (!filter_var($s, FILTER_VALIDATE_EMAIL) || strlen($s) > ($max ?? 150)) {
                    $err = 'Enter a valid email address.';
                    return null;
                }
                return strtolower($s);
            case 'phone':
                $n = self::normalizePhone($s);
                if ($n === null) {
                    $err = 'Enter a valid 10-digit mobile number.';
                    return null;
                }
                return $n;
            case 'bool':
                return in_array($s, ['1', 'true', 'on', 'yes'], true) ? 1 : 0;
            case 'in':
                if (!in_array($s, $enum ?? [], true)) {
                    $err = 'Invalid choice.';
                    return null;
                }
                return $s;
        }
        $err = 'Unsupported rule.';
        return null;
    }

    /** "+91 98765-43210", "098765 43210" -> "9876543210"; null when not a valid Indian mobile number. */
    public static function normalizePhone(string $raw): ?string
    {
        $d = preg_replace('/\D+/', '', $raw) ?? '';
        if (strlen($d) === 12 && str_starts_with($d, '91')) {
            $d = substr($d, 2);
        } elseif (strlen($d) === 11 && $d[0] === '0') {
            $d = substr($d, 1);
        }
        return preg_match('/^[6-9]\d{9}$/', $d) ? $d : null;
    }

    public static function today(): string
    {
        return (new \DateTimeImmutable('today'))->format('Y-m-d');
    }
}
