<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\Office;
use App\Models\User;
use App\Services\DocumentAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class DepartmentController extends Controller
{
    public function __construct(private DocumentAccessService $access) {}

    public function offices(): JsonResponse
    {
        return response()->json([
            'offices' => Office::query()->where('active', true)->with(['departments' => fn ($q) => $q->where('active', true)->orderBy('name')])->orderBy('name')->get(),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $query = Department::query()->with('office:id,name')->orderBy('name');
        if ($request->filled('office_id')) {
            $query->where('office_id', $request->integer('office_id'));
        }
        if (! $request->boolean('include_inactive')) {
            $query->where('active', true);
        }

        return response()->json(['departments' => $query->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->access->assertRegistrar($user);

        $data = $request->validate([
            'office_id' => ['required', 'integer', Rule::exists('offices', 'id')->where('active', true)],
            'name' => ['required', 'string', 'max:255'],
            'active' => ['sometimes', 'boolean'],
        ]);

        $existing = Department::query()
            ->where('office_id', $data['office_id'])
            ->where('name', $data['name'])
            ->first();

        if ($existing) {
            if ($existing->active) {
                throw ValidationException::withMessages([
                    'name' => 'A department with this name already exists in that branch.',
                ]);
            }

            $existing->forceFill(['active' => true])->save();

            return response()->json($existing->load('office:id,name'), 201);
        }

        $dept = Department::query()->create([
            'office_id' => $data['office_id'],
            'name' => $data['name'],
            'active' => $data['active'] ?? true,
        ]);

        return response()->json($dept->load('office:id,name'), 201);
    }

    public function update(Request $request, Department $department): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->access->assertRegistrar($user);

        $officeId = $request->input('office_id', $department->office_id);

        $data = $request->validate([
            'name' => [
                'sometimes',
                'string',
                'max:255',
                Rule::unique('departments', 'name')->where('office_id', $officeId)->ignore($department->id),
            ],
            'active' => ['sometimes', 'boolean'],
            'office_id' => ['sometimes', 'integer', Rule::exists('offices', 'id')->where('active', true)],
        ]);

        $name = $data['name'] ?? $department->name;
        $targetOffice = $data['office_id'] ?? $department->office_id;
        $clash = Department::query()
            ->where('office_id', $targetOffice)
            ->where('name', $name)
            ->whereKeyNot($department->id)
            ->exists();
        if ($clash) {
            throw ValidationException::withMessages([
                'name' => 'A department with this name already exists in that branch.',
            ]);
        }

        $department->fill($data)->save();

        return response()->json($department->fresh()->load('office:id,name'));
    }

    public function destroy(Request $request, Department $department): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->access->assertRegistrar($user);

        $department->forceFill(['active' => false])->save();

        return response()->json(['message' => 'Department deleted.']);
    }

    public function storeOffice(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->access->assertRegistrar($user);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $existing = Office::query()->where('name', $data['name'])->first();
        if ($existing) {
            if ($existing->active) {
                throw ValidationException::withMessages([
                    'name' => 'A branch with this name already exists.',
                ]);
            }

            $existing->forceFill(['active' => true])->save();

            return response()->json(['office' => $existing], 201);
        }

        $office = Office::query()->create([
            'name' => $data['name'],
            'active' => true,
        ]);

        return response()->json(['office' => $office], 201);
    }

    public function updateOffice(Request $request, Office $office): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->access->assertRegistrar($user);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255', Rule::unique('offices', 'name')->ignore($office->id)],
            'active' => ['sometimes', 'boolean'],
        ]);

        $office->fill($data)->save();

        return response()->json(['office' => $office->fresh()]);
    }

    public function destroyOffice(Request $request, Office $office): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->access->assertRegistrar($user);

        $others = Office::query()->where('active', true)->where('id', '!=', $office->id)->exists();
        if ($office->active && ! $others) {
            return response()->json(['message' => 'Cannot delete the last branch.'], 422);
        }

        $office->forceFill(['active' => false])->save();

        return response()->json(['message' => 'Branch deleted.']);
    }
}
