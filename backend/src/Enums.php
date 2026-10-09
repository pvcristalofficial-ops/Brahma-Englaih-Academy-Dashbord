<?php
declare(strict_types=1);

namespace App;

/** Single source of truth for dropdown values; the React app reads them from GET /meta. */
final class Enums
{
    public const SOURCES = [
        'meta_ads'   => 'Meta Ads (FB/Insta Lead Form)',
        'instagram'  => 'Instagram (Organic / DM)',
        'facebook'   => 'Facebook (Organic / DM)',
        'whatsapp'   => 'WhatsApp',
        'google'     => 'Google (Search / Maps / Ads)',
        'website'    => 'Website Form',
        'youtube'    => 'YouTube',
        'walk_in'    => 'Walk-in',
        'phone_call' => 'Phone Call',
        'reference'  => 'Reference / Student Referral',
        'pamphlet'   => 'Banner / Pamphlet / Hoarding',
        'other'      => 'Other',
    ];

    public const STATUSES = [
        'new'            => 'New',
        'follow_up'      => 'In Follow-up',
        'demo_scheduled' => 'Demo Scheduled',
        'admitted'       => 'Admitted',
        'lost'           => 'Lost',
    ];
    public const OPEN_STATUSES = ['new', 'follow_up', 'demo_scheduled'];

    public const INTEREST = ['hot' => 'Hot', 'warm' => 'Warm', 'cold' => 'Cold'];

    public const FOLLOWUP_TYPES = [
        'call' => 'Phone Call', 'whatsapp' => 'WhatsApp', 'visit' => 'Visit / Walk-in',
        'demo' => 'Demo Class', 'email' => 'Email', 'other' => 'Other',
    ];

    /** outcome => [label, status after, terminal(closes enquiry), counts as contact] */
    public const OUTCOMES = [
        'interested'         => ['Interested', 'follow_up', false, true],
        'demo_scheduled'     => ['Demo / Visit scheduled', 'demo_scheduled', false, true],
        'callback_requested' => ['Asked to call back later', 'follow_up', false, true],
        'thinking'           => ['Will think / discuss with family', 'follow_up', false, true],
        'not_picked'         => ['Did not pick up / not reachable', 'follow_up', false, true],
        'busy'               => ['Busy right now', 'follow_up', false, true],
        'rescheduled'        => ['Rescheduled (no contact made)', null, false, false],
        'not_interested'     => ['Not interested', 'lost', true, true],
        'wrong_number'       => ['Wrong number / Invalid', 'lost', true, true],
    ];

    public const LOST_REASONS = [
        'fee_high'            => 'Fees too high',
        'joined_other'        => 'Joined another institute',
        'not_now'             => 'Not interested right now',
        'location_far'        => 'Location too far',
        'timing_issue'        => 'Batch timing does not suit',
        'no_response'         => 'No response after many attempts',
        'wrong_number'        => 'Wrong number / invalid',
        'other'               => 'Other',
    ];

    public const PAYMENT_MODES = [
        'cash' => 'Cash', 'upi' => 'UPI', 'card' => 'Card',
        'bank_transfer' => 'Bank Transfer', 'cheque' => 'Cheque',
    ];

    public const ROLES = ['admin' => 'Admin', 'counsellor' => 'Counsellor'];

    public static function options(array $map): array
    {
        $out = [];
        foreach ($map as $k => $v) {
            $out[] = ['value' => $k, 'label' => is_array($v) ? $v[0] : $v];
        }
        return $out;
    }

    public static function keys(array $map): string
    {
        return implode(',', array_keys($map));
    }
}
