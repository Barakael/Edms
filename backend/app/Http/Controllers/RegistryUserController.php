<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\User;
use App\Services\DocumentAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class RegistryUserController extends Controller
{
    public function __construct(private DocumentAccessService $access) {}

    public function index(Request $request): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->assertCanManageUsers($actor);

        $query = User::query()
            ->with(['office:id,name', 'department:id,name', 'activeSignature'])
            ->where('active', true)
            ->orderBy('name');

        if ($actor->role === User::ROLE_HOD) {
            $query->where('department_id', $actor->department_id);
        }

        $users = $query->get(['id', 'name', 'email', 'phone', 'role', 'active', 'office_id', 'department_id', 'created_at']);

        return response()->json([
            'users' => $users->map(fn (User $user) => $this->present($user))->values(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->assertCanManageUsers($actor);

        $allowedRoles = $actor->role === User::ROLE_HOD
            ? [User::ROLE_STAFF]
            : User::assignableRoles();

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:32'],
            'role' => ['required', Rule::in($allowedRoles)],
            'office_id' => ['required', 'integer', Rule::exists('offices', 'id')->where('active', true)],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'password' => ['nullable', 'string', 'min:8'],
            'active' => ['sometimes', 'boolean'],
        ]);

        if ($actor->role === User::ROLE_HOD) {
            $data['office_id'] = $actor->office_id;
            $data['department_id'] = $actor->department_id;
            $data['role'] = User::ROLE_STAFF;
        }

        $placement = $this->placement($data);

        $tempPassword = $data['password'] ?? Str::password(12);

        $user = User::query()->create([
            'name' => $data['name'],
            'email' => $data['email'],
            'phone' => $data['phone'] ?? null,
            'role' => $data['role'],
            'office_id' => $data['office_id'],
            'department_id' => $placement['department_id'],
            'password' => Hash::make($tempPassword),
            'can_download' => false,
            'active' => $data['active'] ?? true,
        ]);

        return response()->json([
            'user' => $this->present($user),
            'temporary_password' => $data['password'] ?? $tempPassword,
        ], 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->assertCanManageUsers($actor);
        $this->assertCanTouch($actor, $user);

        $allowedRoles = $actor->role === User::ROLE_HOD
            ? [User::ROLE_STAFF]
            : User::assignableRoles();

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => ['sometimes', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'phone' => ['nullable', 'string', 'max:32'],
            'role' => ['sometimes', Rule::in($allowedRoles)],
            'office_id' => ['required', 'integer', Rule::exists('offices', 'id')->where('active', true)],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'active' => ['sometimes', 'boolean'],
            'password' => ['nullable', 'string', 'min:8'],
        ]);

        if ($actor->role === User::ROLE_HOD) {
            $data['office_id'] = $actor->office_id;
            $data['department_id'] = $actor->department_id;
            $data['role'] = User::ROLE_STAFF;
            // HoD cannot deactivate themselves via this path; target stays staff in dept
        }

        $data['role'] = $data['role'] ?? $user->role;
        $placement = $this->placement($data);

        if (! empty($data['password'])) {
            $user->password = Hash::make($data['password']);
        }
        unset($data['password']);

        $user->fill([
            'name' => $data['name'] ?? $user->name,
            'email' => $data['email'] ?? $user->email,
            'phone' => array_key_exists('phone', $data) ? $data['phone'] : $user->phone,
            'role' => $data['role'],
            'office_id' => $data['office_id'],
            'department_id' => $placement['department_id'],
            'active' => $data['active'] ?? $user->active,
        ])->save();

        return response()->json([
            'user' => $this->present($user->fresh()),
        ]);
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->assertCanManageUsers($actor);
        $this->assertCanTouch($actor, $user);

        if ((int) $actor->id === (int) $user->id) {
            return response()->json(['message' => 'You cannot delete your own account.'], 422);
        }

        if ($actor->role === User::ROLE_HOD && $user->role !== User::ROLE_STAFF) {
            throw new AccessDeniedHttpException('Heads of department can only remove staff in their department.');
        }

        if ($user->role === User::ROLE_ADMIN && User::query()->where('role', User::ROLE_ADMIN)->count() <= 1) {
            return response()->json(['message' => 'Cannot delete the last admin.'], 422);
        }

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

    /** @return array<string, mixed> */
    private function present(User $user): array
    {
        $user->loadMissing(['office:id,name', 'department:id,name', 'activeSignature']);

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'role' => $user->role,
            'active' => (bool) $user->active,
            'office_id' => $user->office_id,
            'department_id' => $user->department_id,
            'office' => $user->office?->only(['id', 'name']),
            'department' => $user->department?->only(['id', 'name']),
            'has_signature' => (bool) $user->activeSignature,
        ];
    }

    /** @param  array<string, mixed>  $data
     * @return array{department_id: ?int}
     */
    private function placement(array $data): array
    {
        $role = $data['role'];
        $needsDepartment = in_array($role, [User::ROLE_STAFF, User::ROLE_HOD], true);

        $departmentId = $data['department_id'] ?? null;

        if (! $needsDepartment) {
            return ['department_id' => null];
        }

        if (! $departmentId) {
            throw ValidationException::withMessages(['department_id' => 'Department is required for this role.']);
        }

        $department = Department::query()->findOrFail($departmentId);
        if ((int) $department->office_id !== (int) $data['office_id']) {
            throw ValidationException::withMessages(['department_id' => 'Department does not belong to the selected region.']);
        }

        return [
            'department_id' => (int) $departmentId,
        ];
    }

    private function assertCanManageUsers(User $actor): void
    {
        if ($actor->isRegistrar()) {
            return;
        }

        if ($actor->role === User::ROLE_HOD && $actor->department_id) {
            return;
        }

        throw new AccessDeniedHttpException('You are not allowed to manage users.');
    }

    private function assertCanTouch(User $actor, User $target): void
    {
        if ($actor->isRegistrar()) {
            return;
        }

        if ($actor->role === User::ROLE_HOD
            && (int) $target->department_id === (int) $actor->department_id
            && $target->role === User::ROLE_STAFF) {
            return;
        }

        throw new AccessDeniedHttpException('You can only manage staff in your own department.');
    }
}
