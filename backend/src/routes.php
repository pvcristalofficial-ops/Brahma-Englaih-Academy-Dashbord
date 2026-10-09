<?php
declare(strict_types=1);

use App\Controllers\{AdmissionController, AuditController, AuthController, CourseController, DashboardController,
    EnquiryController, FollowupController, MetaController, PublicController, ReceiptController, SettingsController, UserController};
use App\Router;

return static function (Router $r): void {
    $admin = ['roles' => ['admin']];
    $open = ['auth' => false];

    $r->add('GET', '/health', static function () {
        \App\Db::val('SELECT 1');
        return ['data' => ['status' => 'ok']];
    }, $open);

    // Auth
    $r->add('POST', '/auth/login', [AuthController::class, 'login'], $open);
    $r->add('GET', '/auth/me', [AuthController::class, 'me'], $open);
    $r->add('POST', '/auth/logout', [AuthController::class, 'logout']);
    $r->add('POST', '/auth/change-password', [AuthController::class, 'changePassword']);
    $r->add('GET', '/meta', [MetaController::class, 'options']);

    // Dashboard
    $r->add('GET', '/dashboard', [DashboardController::class, 'summary']);

    // Enquiries
    $r->add('GET', '/enquiries', [EnquiryController::class, 'index']);
    $r->add('POST', '/enquiries', [EnquiryController::class, 'store']);
    $r->add('GET', '/enquiries/check-duplicate', [EnquiryController::class, 'checkDuplicate']);
    $r->add('GET', '/enquiries/export', [EnquiryController::class, 'export'], $admin);
    $r->add('GET', '/enquiries/{id}', [EnquiryController::class, 'show']);
    $r->add('PUT', '/enquiries/{id}', [EnquiryController::class, 'update']);
    $r->add('POST', '/enquiries/{id}/archive', [EnquiryController::class, 'archive'], $admin);
    $r->add('POST', '/enquiries/{id}/restore', [EnquiryController::class, 'restore'], $admin);
    $r->add('POST', '/enquiries/{id}/reopen', [EnquiryController::class, 'reopen']);
    $r->add('POST', '/enquiries/{id}/followups', [FollowupController::class, 'store']);
    $r->add('POST', '/enquiries/{id}/admit', [AdmissionController::class, 'admit']);

    // Today's follow-ups
    $r->add('GET', '/followups', [FollowupController::class, 'due']);

    // Admissions, fees, receipts
    $r->add('GET', '/admissions', [AdmissionController::class, 'index']);
    $r->add('GET', '/admissions/{id}', [AdmissionController::class, 'show']);
    $r->add('PUT', '/admissions/{id}', [AdmissionController::class, 'update']);
    $r->add('POST', '/admissions/{id}/payments', [AdmissionController::class, 'addPayment']);
    $r->add('POST', '/admissions/{id}/adjust-fee', [AdmissionController::class, 'adjustFee'], $admin);
    $r->add('GET', '/fees/due', [AdmissionController::class, 'dues']);
    $r->add('GET', '/receipts', [ReceiptController::class, 'index']);
    $r->add('GET', '/receipts/{id}', [ReceiptController::class, 'show']);
    $r->add('POST', '/receipts/{id}/void', [ReceiptController::class, 'void'], $admin);

    // Admin: masters
    $r->add('GET', '/courses', [CourseController::class, 'index']);
    $r->add('POST', '/courses', [CourseController::class, 'store'], $admin);
    $r->add('PUT', '/courses/{id}', [CourseController::class, 'update'], $admin);
    $r->add('GET', '/users', [UserController::class, 'index'], $admin);
    $r->add('POST', '/users', [UserController::class, 'store'], $admin);
    $r->add('PUT', '/users/{id}', [UserController::class, 'update'], $admin);
    $r->add('POST', '/users/{id}/reset-password', [UserController::class, 'resetPassword'], $admin);
    $r->add('GET', '/settings', [SettingsController::class, 'show']);
    $r->add('PUT', '/settings', [SettingsController::class, 'update'], $admin);
    $r->add('GET', '/backup/download', [SettingsController::class, 'backup'], $admin);
    $r->add('GET', '/audit-logs', [AuditController::class, 'index'], $admin);

    // Public website form
    $r->add('OPTIONS', '/public/enquiry', [PublicController::class, 'preflight'], $open);
    $r->add('POST', '/public/enquiry', [PublicController::class, 'enquiry'], $open + ['csrf' => false]);
};
