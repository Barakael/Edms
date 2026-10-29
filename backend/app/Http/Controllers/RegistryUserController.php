<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\Station;
use App\Models\User;
use App\Services\DocumentAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class RegistryUserController extends Controller
{
    public function __construct(private DocumentAccessService $access) {}

    public function index(Request $request): JsonResponse
    {
        $this->access->assertRegistrar($request->user());

        $users = User::query()
            ->with(['office:id,name', 'station:id,name', 'department:id,name', 'activeSignature'])
            ->where('active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'phone', 'role', 'active', 'office_id', 'station_id', 'department_id', 'created_at']);

        return response()->json([
            'users' => $users->map(fn (User $user) => $this->present($user))->values(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->access->assertRegistrar($request->user());

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:32'],
            'role' => ['required', Rule::in(User::assignableRoles())],
            'office_id' => ['required', 'integer', Rule::exists('offices', 'id')->where('active', true)],
            'station_id' => ['nullable', 'integer', 'exists:stations,id'],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'password' => ['nullable', 'string', 'min:8'],
            'active' => ['sometimes', 'boolean'],
        ]);

        $placement = $this->placement($data);

        $tempPassword = $data['password'] ?? Str::password(12);

        $user = User::query()->create([
            'name' => $data['name'],
            'email' => $data['email'],
            'phone' => $data['phone'] ?? null,
            'role' => $data['role'],
            'office_id' => $data['office_id'],
            'station_id' => $placement['station_id'],
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
        $this->access->assertRegistrar($request->user());

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => ['sometimes', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'phone' => ['nullable', 'string', 'max:32'],
            'role' => ['sometimes', Rule::in(User::assignableRoles())],
            'office_id' => ['required', 'integer', Rule::exists('offices', 'id')->where('active', true)],
            'station_id' => ['nullable', 'integer', 'exists:stations,id'],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'active' => ['sometimes', 'boolean'],
            'password' => ['nullable', 'string', 'min:8'],
        ]);

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
            'station_id' => $placement['station_id'],
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

    /** @return array<string, mixed> */
    private function present(User $user): array
    {
        $user->loadMissing(['office:id,name', 'station:id,name', 'department:id,name', 'activeSignature']);

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'role' => $user->role,
            'active' => (bool) $user->active,
            'office_id' => $user->office_id,
            'station_id' => $user->station_id,
            'department_id' => $user->department_id,
            'office' => $user->office?->only(['id', 'name']),
            'station' => $user->station?->only(['id', 'name']),
            'department' => $user->department?->only(['id', 'name']),
            'has_signature' => (bool) $user->activeSignature,
        ];
    }

    /** @param  array<string, mixed>  $data
     * @return array{station_id: ?int, department_id: ?int}
     */
    private function placement(array $data): array
    {
        $role = $data['role'];
        $needsStation = in_array($role, [User::ROLE_STAFF, User::ROLE_HOS, User::ROLE_HOD], true);
        $needsDepartment = in_array($role, [User::ROLE_STAFF, User::ROLE_HOD], true);

        $stationId = $data['station_id'] ?? null;
        $departmentId = $data['department_id'] ?? null;

        if (! $needsStation) {
            return ['station_id' => null, 'department_id' => null];
        }

        if (! $stationId) {
            throw ValidationException::withMessages(['station_id' => 'Station is required for this role.']);
        }

        $station = Station::query()->findOrFail($stationId);
        if ((int) $station->office_id !== (int) $data['office_id']) {
            throw ValidationException::withMessages(['station_id' => 'Station does not belong to the selected region.']);
        }

        if ($needsDepartment && ! $departmentId) {
            throw ValidationException::withMessages(['department_id' => 'Department is required for this role.']);
        }

        if ($departmentId) {
            $department = Department::query()->findOrFail($departmentId);
            if ((int) $department->station_id !== (int) $station->id) {
                throw ValidationException::withMessages(['department_id' => 'Department does not belong to the selected station.']);
            }
        }

        if ($role === User::ROLE_HOS) {
            $departmentId = null;
        }

        return [
            'station_id' => (int) $stationId,
            'department_id' => $departmentId ? (int) $departmentId : null,
        ];
    }
}
