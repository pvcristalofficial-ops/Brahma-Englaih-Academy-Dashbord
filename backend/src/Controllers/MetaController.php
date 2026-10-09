<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Db;
use App\Enums;
use App\Settings;

final class MetaController
{
    public static function options(): array
    {
        $courses = array_map(static fn ($c) => ['id' => (int) $c['id'], 'name' => $c['name'], 'fee' => (float) $c['fee'], 'duration' => $c['duration']],
            Db::all('SELECT id, name, fee, duration FROM courses WHERE is_active = 1 ORDER BY name'));
        $users = array_map(static fn ($u) => ['id' => (int) $u['id'], 'name' => $u['name']],
            Db::all('SELECT id, name FROM users WHERE is_active = 1 ORDER BY name'));
        $outcomes = [];
        foreach (Enums::OUTCOMES as $k => [$label, , $terminal]) {
            $outcomes[] = ['value' => $k, 'label' => $label, 'terminal' => $terminal];
        }
        $s = Settings::all();
        return ['data' => [
            'sources'       => Enums::options(Enums::SOURCES),
            'statuses'      => Enums::options(Enums::STATUSES),
            'interest'      => Enums::options(Enums::INTEREST),
            'followup_types' => Enums::options(Enums::FOLLOWUP_TYPES),
            'outcomes'      => $outcomes,
            'lost_reasons'  => Enums::options(Enums::LOST_REASONS),
            'payment_modes' => Enums::options(Enums::PAYMENT_MODES),
            'roles'         => Enums::options(Enums::ROLES),
            'courses'       => $courses,
            'users'         => $users,
            'academy'       => [
                'name' => $s['academy_name'] ?? '', 'tagline' => $s['academy_tagline'] ?? '',
                'stale_days' => Settings::staleDays(),
            ],
            'is_admin'      => Auth::isAdmin(),
        ]];
    }
}
