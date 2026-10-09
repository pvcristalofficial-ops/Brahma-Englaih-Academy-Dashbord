<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Audit;
use App\Config;
use App\Db;
use App\Enums;
use App\HttpException;
use App\RateLimiter;
use App\Request;
use App\Services\EnquiryService as E;
use App\Validator;

/**
 * Website enquiry form endpoint (brahmaenglishacademy.com -> this dashboard).
 * Protected by: shared form key, honeypot field, per-IP rate limit and strict validation.
 * It never reveals whether a number already exists.
 */
final class PublicController
{
    private static function cors(Request $req): void
    {
        $origin = (string) $req->header('origin');
        $allowed = (array) Config::get('app.public_form_origins', []);
        if ($origin !== '' && in_array($origin, $allowed, true)) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Vary: Origin');
            header('Access-Control-Allow-Headers: Content-Type, X-Form-Key');
            header('Access-Control-Allow-Methods: POST, OPTIONS');
            header('Access-Control-Max-Age: 600');
        }
    }

    public static function preflight(Request $req): never
    {
        self::cors($req);
        http_response_code(204);
        exit;
    }

    public static function enquiry(Request $req): array
    {
        self::cors($req);
        $formKey = (string) Config::get('app.public_form_key', '');
        if ($formKey === '') {
            throw new HttpException(404, 'Endpoint not found.');
        }
        $in = $req->json(true);
        $sent = (string) ($in['key'] ?? $req->header('x-form-key') ?? '');
        if (!hash_equals($formKey, $sent)) {
            throw new HttpException(403, 'Invalid form key.');
        }
        if (!empty($in['company'])) { // honeypot: humans never fill this hidden field
            return ['data' => ['ok' => true]];
        }
        RateLimiter::enforce('public:ip:' . $req->ip(), 20, 3600, 'Too many submissions. Please call us instead.');

        $in['source'] = ($in['source'] ?? '') ?: 'website';
        $d = Validator::validate($in, [
            'student_name' => 'required|string|max:100',
            'phone'        => 'required|phone',
            'email'        => 'nullable|email',
            'city'         => 'nullable|string|max:80',
            'source'       => 'required|in:' . Enums::keys(Enums::SOURCES),
            'campaign'     => 'nullable|string|max:120',
            'message'      => 'nullable|text|max:1000',
            'course'       => 'nullable|string|max:120',
        ]);

        $note = trim(($d['course'] ? 'Interested in: ' . $d['course'] . "\n" : '') . ($d['message'] ?? ''));
        $courseId = null;
        if ($d['course']) {
            $courseId = Db::val('SELECT id FROM courses WHERE is_active = 1 AND name = ?', [$d['course']]);
            $courseId = $courseId ? (int) $courseId : null;
        }
        $data = [
            'student_name' => $d['student_name'], 'phone' => $d['phone'], 'email' => $d['email'], 'city' => $d['city'],
            'source' => $d['source'], 'campaign' => $d['campaign'], 'notes' => $note !== '' ? mb_substr($note, 0, 2000) : null,
            'course_id' => $courseId, 'interest_level' => 'warm',
        ];
        $data += ['parent_name' => null, 'alt_phone' => null, 'qualification' => null, 'assigned_to' => null,
                  'enquiry_date' => null, 'next_follow_up_date' => null, 'next_follow_up_time' => null];

        try {
            E::create($data, null, null);
        } catch (HttpException $e) {
            if ($e->errorCode !== 'duplicate') {
                throw $e;
            }
            // Known number enquired again: surface it in today's follow-ups instead of creating a duplicate.
            $id = (int) $e->extra['existing']['id'];
            Db::tx(function () use ($id, $note) {
                $cur = Db::one('SELECT status, is_archived, next_follow_up_date FROM enquiries WHERE id = ? FOR UPDATE', [$id]);
                if (!$cur || (int) $cur['is_archived']) {
                    return;
                }
                $today = Validator::today();
                if (in_array($cur['status'], Enums::OPEN_STATUSES, true) && (!$cur['next_follow_up_date'] || $cur['next_follow_up_date'] > $today)) {
                    Db::exec('UPDATE enquiries SET next_follow_up_date = ?, version = version + 1 WHERE id = ?', [$today, $id]);
                }
                Db::insert('followups', [
                    'enquiry_id' => $id, 'type' => 'other', 'outcome' => 'reenquiry',
                    'note' => 'Enquired again via website form.' . ($note !== '' ? "\n" . $note : ''),
                ]);
                Audit::log('reenquiry', 'enquiry', $id, 'Duplicate website enquiry merged into existing record');
            });
        }
        return ['data' => ['ok' => true, 'message' => 'Thank you! Our counsellor will contact you shortly.']];
    }
}
