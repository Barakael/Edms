<?php

namespace App\Http\Controllers;

use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class RoleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->assertCanManage($request);

        return response()->json(['roles' => $this->presentRoles()]);
    }

    public function update(Request $request, Role $role): JsonResponse
    {
        $this->assertCanManage($request);

        $data = $request->validate([
            'label' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:2000'],
            'value' => ['sometimes', 'string', 'max:64', 'alpha_dash', Rule::unique('roles', 'value')->ignore($role->id)],
        ]);

        $oldValue = $role->value;
        $newValue = $data['value'] ?? $oldValue;

        DB::transaction(function () use ($role, $data, $oldValue, $newValue) {
            $role->fill([
                'label' => $data['label'],
                'description' => $data['description'] ?? '',
                'value' => $newValue,
            ])->save();

            if ($newValue !== $oldValue) {
                User::query()->where('role', $oldValue)->update(['role' => $newValue]);
            }
        });

        return response()->json([
            'role' => $this->presentRole($role->fresh()),
            'roles' => $this->presentRoles(),
        ]);
    }

    public function destroy(Request $request, Role $role): JsonResponse
    {
        /** @var User $actor */
        $actor = $this->assertCanManage($request);

        if ($role->value === User::ROLE_ADMIN) {
            return response()->json(['message' => 'The system admin role cannot be deleted.'], 422);
        }

        if ($actor->role === $role->value) {
            return response()->json(['message' => 'You cannot delete the role assigned to your own account.'], 422);
        }

        $staff = User::query()
            ->where('role', $role->value)
            ->where('active', true)
            ->get();

        if ($staff->contains(fn (User $user) => (int) $user->id === (int) $actor->id)) {
            return response()->json(['message' => 'You cannot delete a role that includes your own account.'], 422);
        }

        $removed = 0;

        DB::transaction(function () use ($staff, $role, &$removed) {
            foreach ($staff as $user) {
                $this->softDeleteStaff($user);
                $removed++;
            }

            $role->delete();
        });

        return response()->json([
            'message' => $removed > 0
                ? "Role deleted and {$removed} staff member(s) removed."
                : 'Role deleted.',
            'removed_staff' => $removed,
            'roles' => $this->presentRoles(),
        ]);
    }

    private function assertCanManage(Request $request): User
    {
        /** @var User|null $actor */
        $actor = $request->user();
        if (! $actor || ! $actor->isRegistrar()) {
            abort(403, 'Forbidden');
        }

        return $actor;
    }

    /** @return list<array{id: int, value: string, label: string, description: string, staff_count: int}> */
    private function presentRoles(): array
    {
        $counts = User::query()
            ->where('active', true)
            ->selectRaw('role, count(*) as total')
            ->groupBy('role')
            ->pluck('total', 'role');

        return Role::query()
            ->orderBy('id')
            ->get()
            ->map(fn (Role $role) => $this->presentRole($role, $counts))
            ->values()
            ->all();
    }

    /** @param  \Illuminate\Support\Collection<string, int>|null  $counts */
    private function presentRole(Role $role, $counts = null): array
    {
        $counts ??= User::query()
            ->where('active', true)
            ->selectRaw('role, count(*) as total')
            ->groupBy('role')
            ->pluck('total', 'role');

        return [
            'id' => $role->id,
            'value' => $role->value,
            'label' => $role->label,
            'description' => $role->description ?? '',
            'staff_count' => (int) ($counts[$role->value] ?? 0),
        ];
    }

    private function softDeleteStaff(User $user): void
    {
        $user->forceFill([
            'active' => false,
            'name' => $user->name.' (deleted)',
            'email' => 'deleted+'.$user->id.'.'.time().'@invalid.local',
            'phone' => null,
            'password' => Hash::make(Str::password(32)),
            'token_version' => ((int) $user->token_version) + 1,
        ])->save();
    }
}
