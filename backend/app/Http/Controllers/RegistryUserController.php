<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\DocumentAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class RegistryUserController extends Controller
{
    public function __construct(private DocumentAccessService $access) {}

    public function index(Request $request): JsonResponse
    {
        $this->access->assertRegistrar($request->user());

        $users = User::query()
            ->where('active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'phone', 'role', 'active', 'created_at']);

        return response()->json(['users' => $users]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->access->assertRegistrar($request->user());

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:32'],
            'role' => ['required', Rule::in([
                User::ROLE_REGISTRAR,
                User::ROLE_ACTION_OFFICER,
                User::ROLE_DIRECTOR,
                User::ROLE_MEMBER,
                User::ROLE_ADMIN,
            ])],
            'password' => ['nullable', 'string', 'min:8'],
            'active' => ['sometimes', 'boolean'],
        ]);

        $tempPassword = $data['password'] ?? Str::password(12);

        $user = User::query()->create([
            'name' => $data['name'],
            'email' => $data['email'],
            'phone' => $data['phone'] ?? null,
            'role' => $data['role'],
            'password' => Hash::make($tempPassword),
            'can_download' => false,
            'active' => $data['active'] ?? true,
        ]);

        return response()->json([
            'user' => $user->only(['id', 'name', 'email', 'phone', 'role', 'active']),
            'temporary_password' => $data['password'] ?? $tempPassword,
        ], 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $this->access->assertRegistrar($request->user());

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => ['sometimes', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'phone' => ['nullable', 'string', 'max:32'],
            'role' => ['sometimes', Rule::in([
                User::ROLE_REGISTRAR,
                User::ROLE_ACTION_OFFICER,
                User::ROLE_DIRECTOR,
                User::ROLE_MEMBER,
                User::ROLE_ADMIN,
            ])],
            'active' => ['sometimes', 'boolean'],
            'password' => ['nullable', 'string', 'min:8'],
        ]);

        if (! empty($data['password'])) {
            $user->password = Hash::make($data['password']);
            unset($data['password']);
        }

        $user->fill($data)->save();

        return response()->json([
            'user' => $user->fresh()->only(['id', 'name', 'email', 'phone', 'role', 'active']),
        ]);
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->access->assertRegistrar($actor);

        if ((int) $actor->id === (int) $user->id) {
            return response()->json(['message' => 'You cannot delete your own account.'], 422);
        }

        if ($user->role === User::ROLE_ADMIN && User::query()->where('role', User::ROLE_ADMIN)->count() <= 1) {
            return response()->json(['message' => 'Cannot delete the last admin.'], 422);
        }

        // Soft-remove: deactivate and scrub login fields (hard delete breaks document FKs).
        $user->forceFill([
            'active' => false,
            'name' => $user->name.' (deleted)',
            'email' => 'deleted+'.$user->id.'.'.time().'@invalid.local',
            'phone' => null,
            'password' => Hash::make(Str::password(32)),
            'token_version' => ((int) $user->token_version) + 1,
        ])->save();

        return response()->json(['message' => 'User deleted.']);
    }
}
