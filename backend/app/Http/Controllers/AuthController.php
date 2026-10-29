<?php

namespace App\Http\Controllers;

use App\Models\RefreshToken;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\MailRoutingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use PHPOpenSourceSaver\JWTAuth\Facades\JWTAuth;

class AuthController extends Controller
{
    public function __construct(
        private AuditLogger $audit,
        private MailRoutingService $routing,
    ) {}

    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::query()->where('email', $credentials['email'])->first();

        if (! $user || ! $user->active || ! Hash::check($credentials['password'], $user->password)) {
            $this->audit->log($user, 'login_failed', 'user', $user?->id ? (string) $user->id : null, 'denied', [
                'email' => $credentials['email'],
            ], $request);

            throw ValidationException::withMessages([
                'email' => ['Invalid credentials.'],
            ]);
        }

        $token = JWTAuth::claims(['tv' => $user->token_version])->fromUser($user);
        $refresh = $this->issueRefreshToken($user);

        $user->forceFill(['last_login_at' => now()])->save();

        $this->audit->log($user, 'login', 'user', (string) $user->id, 'success', null, $request);

        return response()->json([
            'access_token' => $token,
            'token_type' => 'bearer',
            'expires_in' => (int) config('jwt.ttl', 60) * 60,
            'refresh_token' => $refresh,
            'user' => $this->userPayload($user),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $user->load('activeSignature');

        return response()->json(['user' => $this->userPayload($user)]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $data = $request->validate([
            'current_password' => ['required_with:password', 'string'],
            'password' => ['nullable', 'string', 'min:8', 'confirmed'],
            'signature_2fa_enabled' => ['sometimes', 'boolean'],
        ]);

        if (! empty($data['password'])) {
            if (! Hash::check($data['current_password'] ?? '', $user->password)) {
                throw ValidationException::withMessages([
                    'current_password' => ['Current password is incorrect.'],
                ]);
            }
            $user->password = Hash::make($data['password']);
        }

        if (array_key_exists('signature_2fa_enabled', $data)) {
            $user->signature_2fa_enabled = (bool) $data['signature_2fa_enabled'];
        }

        $user->save();
        $user->load('activeSignature');

        $this->audit->log($user, 'settings_update', 'user', (string) $user->id, 'success', [
            'password_changed' => ! empty($data['password']),
            'signature_2fa_enabled' => (bool) $user->signature_2fa_enabled,
        ], $request);

        return response()->json(['user' => $this->userPayload($user)]);
    }

    public function refresh(Request $request): JsonResponse
    {
        $data = $request->validate([
            'refresh_token' => ['required', 'string'],
        ]);

        $hash = hash('sha256', $data['refresh_token']);
        $stored = RefreshToken::query()
            ->where('token_hash', $hash)
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->first();

        if (! $stored) {
            $this->audit->log(null, 'refresh_failed', null, null, 'denied', null, $request);

            return response()->json(['message' => 'Invalid refresh token.'], 401);
        }

        $user = $stored->user;
        if (! $user || ! $user->active) {
            return response()->json(['message' => 'User inactive.'], 401);
        }

        $stored->forceFill(['revoked_at' => now()])->save();
        $token = JWTAuth::claims(['tv' => $user->token_version])->fromUser($user);
        $refresh = $this->issueRefreshToken($user);

        return response()->json([
            'access_token' => $token,
            'token_type' => 'bearer',
            'expires_in' => (int) config('jwt.ttl', 60) * 60,
            'refresh_token' => $refresh,
            'user' => $this->userPayload($user),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($request->filled('refresh_token')) {
            $hash = hash('sha256', $request->string('refresh_token'));
            RefreshToken::query()
                ->where('user_id', $user->id)
                ->where('token_hash', $hash)
                ->update(['revoked_at' => now()]);
        }

        try {
            JWTAuth::invalidate(JWTAuth::getToken());
        } catch (\Throwable) {
            // token may already be invalid
        }

        $this->audit->log($user, 'logout', 'user', (string) $user->id, 'success', null, $request);

        return response()->json(['message' => 'Logged out.']);
    }

    public function revokeAllSessions(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $user->increment('token_version');
        RefreshToken::query()
            ->where('user_id', $user->id)
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);

        $this->audit->log($user, 'session_revoke_all', 'user', (string) $user->id, 'success', null, $request);

        return response()->json(['message' => 'All sessions revoked. Please log in again.']);
    }

    public function stepUp(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $data = $request->validate([
            'password' => ['required', 'string'],
        ]);

        if (! Hash::check($data['password'], $user->password)) {
            $this->audit->log($user, 'step_up_failed', 'user', (string) $user->id, 'denied', null, $request);

            throw ValidationException::withMessages([
                'password' => ['Invalid password.'],
            ]);
        }

        $user->forceFill(['step_up_verified_at' => now()])->save();
        $this->audit->log($user, 'step_up', 'user', (string) $user->id, 'success', null, $request);

        return response()->json([
            'message' => 'Step-up verified.',
            'step_up_verified_at' => $user->step_up_verified_at,
        ]);
    }

    private function issueRefreshToken(User $user): string
    {
        $max = (int) config('edms.max_concurrent_sessions', 5);
        $active = RefreshToken::query()
            ->where('user_id', $user->id)
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->orderByDesc('id')
            ->get();

        if ($active->count() >= $max) {
            $active->slice($max - 1)->each(fn (RefreshToken $t) => $t->forceFill(['revoked_at' => now()])->save());
        }

        $plain = Str::random(64);
        RefreshToken::query()->create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', $plain),
            'expires_at' => now()->addDays((int) config('edms.refresh_token_days', 14)),
        ]);

        return $plain;
    }

    private function userPayload(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'role' => $user->role,
            'department_id' => $user->department_id,
            'department_name' => $user->department?->name,
            'hod_name' => $user->role === User::ROLE_STAFF
                ? $this->routing->findHeadOfDepartment($user)?->name
                : null,
            'can_download' => (bool) $user->can_download,
            'signature_2fa_enabled' => (bool) $user->signature_2fa_enabled,
            'has_signature' => (bool) $user->activeSignature,
            'step_up_verified_at' => $user->step_up_verified_at,
        ];
    }
}
