<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\DepartmentController;
use App\Http\Controllers\DocumentController;
use App\Http\Controllers\DocumentFileController;
use App\Http\Controllers\DownloadRequestController;
use App\Http\Controllers\EmailDraftController;
use App\Http\Controllers\EmailIngestController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\OtpController;
use App\Http\Controllers\RegistryFileController;
use App\Http\Controllers\RegistryUserController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\SignatureController;
use App\Http\Controllers\UserDirectoryController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
Route::post('/auth/refresh', [AuthController::class, 'refresh'])->middleware('throttle:30,1');

Route::post('/email/ingest', [EmailIngestController::class, 'ingest'])->middleware('throttle:60,1');

Route::get('/sign-capture/{token}', [SignatureController::class, 'iphoneSessionStatus']);
Route::post('/sign-capture/{token}', [SignatureController::class, 'submitIphoneCapture'])->middleware('throttle:30,1');

Route::middleware(['auth:api', 'jwt.version', 'throttle:120,1'])->group(function () {
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::put('/auth/settings', [AuthController::class, 'updateSettings']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::post('/auth/revoke-sessions', [AuthController::class, 'revokeAllSessions']);
    Route::post('/auth/step-up', [AuthController::class, 'stepUp']);

    Route::get('/users/assignees', [UserDirectoryController::class, 'assignees']);
    Route::get('/registry/users', [RegistryUserController::class, 'index']);
    Route::post('/registry/users', [RegistryUserController::class, 'store']);
    Route::put('/registry/users/{user}', [RegistryUserController::class, 'update']);
    Route::delete('/registry/users/{user}', [RegistryUserController::class, 'destroy']);
    Route::post('/registry/users/{user}/signature', [SignatureController::class, 'assignForUser']);
    Route::get('/roles', [RoleController::class, 'index']);
    Route::put('/roles/{role}', [RoleController::class, 'update']);
    Route::delete('/roles/{role}', [RoleController::class, 'destroy']);

    Route::get('/offices', [DepartmentController::class, 'offices']);
    Route::post('/offices', [DepartmentController::class, 'storeOffice']);
    Route::put('/offices/{office}', [DepartmentController::class, 'updateOffice']);
    Route::delete('/offices/{office}', [DepartmentController::class, 'destroyOffice']);
    Route::get('/departments', [DepartmentController::class, 'index']);
    Route::post('/departments', [DepartmentController::class, 'store']);
    Route::put('/departments/{department}', [DepartmentController::class, 'update']);
    Route::delete('/departments/{department}', [DepartmentController::class, 'destroy']);
    Route::get('/notifications/summary', [NotificationController::class, 'summary']);
    Route::post('/notifications/mark-read', [NotificationController::class, 'markRead']);

    Route::get('/download-access', [DownloadRequestController::class, 'mine']);
    Route::post('/download-access/request', [DownloadRequestController::class, 'requestAccess']);
    Route::get('/download-requests', [DownloadRequestController::class, 'index']);
    Route::post('/download-requests/{downloadRequest}/review', [DownloadRequestController::class, 'review']);

    Route::post('/otp/sign/request', [OtpController::class, 'requestSign'])->middleware('throttle:10,1');
    Route::post('/otp/sign/verify', [OtpController::class, 'verifySign'])->middleware('throttle:20,1');

    Route::get('/registry-files', [RegistryFileController::class, 'index']);
    Route::post('/registry-files', [RegistryFileController::class, 'store']);
    Route::get('/registry-files/{registryFile}', [RegistryFileController::class, 'show']);
    Route::put('/registry-files/{registryFile}', [RegistryFileController::class, 'update']);
    Route::delete('/registry-files/{registryFile}', [RegistryFileController::class, 'destroy']);
    Route::post('/registry-files/{registryFile}/archive', [RegistryFileController::class, 'archive']);
    Route::post('/registry-files/{registryFile}/retrieve', [RegistryFileController::class, 'retrieve']);

    Route::get('/documents/inbox', [DocumentController::class, 'inbox']);
    Route::get('/documents/search', [DocumentController::class, 'search']);
    Route::post('/documents', [DocumentController::class, 'store']);
    Route::post('/documents/bulk-ingest', [DocumentController::class, 'bulkIngest']);
    Route::post('/documents/bulk-action', [DocumentController::class, 'bulkAction']);
    Route::get('/documents/{document}/comments/pdf', [DocumentController::class, 'commentsPdf']);
    Route::get('/documents/{document}', [DocumentController::class, 'show']);
    Route::put('/documents/{document}', [DocumentController::class, 'update']);
    Route::delete('/documents/{document}', [DocumentController::class, 'destroy']);
    Route::post('/documents/{document}/assign', [DocumentController::class, 'assign']);
    Route::post('/documents/{document}/lock', [DocumentController::class, 'lock']);
    Route::post('/documents/{document}/unlock', [DocumentController::class, 'unlock']);
    Route::post('/documents/{document}/download-permission', [DocumentController::class, 'setDownloadPermission']);
    Route::post('/documents/{document}/comments', [DocumentController::class, 'comment']);
    Route::post('/documents/{document}/close', [DocumentController::class, 'close']);
    Route::get('/documents/{document}/pipeline', [DocumentController::class, 'pipeline']);
    Route::post('/documents/{document}/signatures', [SignatureController::class, 'place']);
    Route::put('/documents/{document}/signatures/{placement}', [SignatureController::class, 'move']);
    Route::delete('/documents/{document}/signatures/{placement}', [SignatureController::class, 'destroyPlacement']);

    Route::get('/files/{file}/stream', [DocumentFileController::class, 'stream']);
    Route::get('/files/{file}/download', [DocumentFileController::class, 'download']);

    Route::get('/signature', [SignatureController::class, 'showProfile']);
    Route::post('/signature', [SignatureController::class, 'storeProfile']);
    Route::post('/signature/iphone-session', [SignatureController::class, 'startIphoneSession']);

    Route::get('/email-drafts', [EmailDraftController::class, 'index']);
    Route::post('/email-drafts/{emailDraft}/claim', [EmailDraftController::class, 'claim']);
});
