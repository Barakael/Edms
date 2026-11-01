<?php

namespace App\Http\Controllers;

use App\Mail\SignOtpMail;
use App\Models\OtpChallenge;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\Sms\SmsSender;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class OtpController extends Controller
{
    public function __construct(
        private SmsSender $sms,
        private AuditLogger $audit,
    ) {}

    public function requestSign(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $data = $request->validate([
            'channel' => ['nullable', Rule::in(['email', 'sms'])],
        ]);

        $channel = $data['channel'] ?? 'email';
        if ($channel === 'sms' && ! $user->phone) {
            return response()->json(['message' => 'No phone on file for SMS OTP.'], 422);
        }

        $ttl = (int) config('edms.otp_ttl_seconds', 120);
        $code = (string) random_int(100000, 999999);

        OtpChallenge::query()
            ->where('user_id', $user->id)
            ->where('purpose', 'sign')
            ->whereNull('consumed_at')
            ->update(['consumed_at' => now()]);

        OtpChallenge::query()->create([
            'user_id' => $user->id,
            'purpose' => 'sign',
            'code_hash' => Hash::make($code),
            'channel' => $channel,
            'expires_at' => now()->addSeconds($ttl),
        ]);

        if ($channel === 'email') {
            try {
                Mail::to($user->email)->send(new SignOtpMail($user, $code, $ttl));
            } catch (\Throwable $e) {
                $this->audit->log($user, 'otp_mail_failed', 'user', (string) $user->id, 'denied', [
                    'error' => $e->getMessage(),
                ], $request);
                // In local/log mailers this usually works; still return code only when APP_DEBUG for QA
                if (config('app.debug')) {
                    return response()->json([
                        'message' => 'OTP issued (debug).',
                        'expires_in' => $ttl,
                        'debug_code' => $code,
                    ]);
                }

                return response()->json(['message' => 'Unable to send OTP email.'], 500);
            }
        } else {
            $this->sms->send($user->phone, "rDMS-HQ signature code: {$code} (expires in {$ttl}s)");
            if (config('app.debug')) {
                return response()->json([
                    'message' => 'OTP issued via SMS scaffold (debug).',
                    'expires_in' => $ttl,
                    'debug_code' => $code,
                ]);
            }
        }

        return response()->json([
            'message' => 'OTP sent.',
            'expires_in' => $ttl,
            'channel' => $channel,
        ]);
    }

    public function verifySign(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $data = $request->validate([
            'code' => ['required', 'string', 'size:6'],
        ]);

        $challenge = OtpChallenge::query()
            ->where('user_id', $user->id)
            ->where('purpose', 'sign')
            ->whereNull('consumed_at')
            ->where('expires_at', '>', now())
            ->latest('id')
            ->first();

        if (! $challenge || ! Hash::check($data['code'], $challenge->code_hash)) {
            $this->audit->log($user, 'otp_verify_failed', 'user', (string) $user->id, 'denied', null, $request);

            return response()->json(['message' => 'Invalid or expired code.'], 422);
        }

        $token = Str::random(48);
        $ttl = (int) config('edms.otp_ttl_seconds', 120);

        $challenge->forceFill([
            'sign_token' => $token,
            'consumed_at' => now(),
            'expires_at' => now()->addSeconds($ttl),
        ])->save();

        return response()->json([
            'sign_token' => $token,
            'expires_in' => $ttl,
        ]);
    }
}
