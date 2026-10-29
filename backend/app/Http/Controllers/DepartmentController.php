<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\Office;
use App\Models\Station;
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
        $query = Department::query()->with(['office:id,name', 'station:id,name,office_id'])->orderBy('name');
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
            'station_id' => ['required', 'integer', Rule::exists('stations', 'id')->where('active', true)],
            'name' => ['required', 'string', 'max:255'],
            'active' => ['sometimes', 'boolean'],
        ]);

        $station = Station::query()->findOrFail($data['station_id']);

        $existing = Department::query()
            ->where('station_id', $station->id)
            ->where('name', $data['name'])
            ->first();

        if ($existing) {
            if ($existing->active) {
                throw ValidationException::withMessages([
                    'name' => 'A department with this name already exists in that station.',
                ]);
            }

            $existing->forceFill(['active' => true, 'office_id' => $station->office_id])->save();

            return response()->json($existing->load(['office:id,name', 'station:id,name']), 201);
        }

        $dept = Department::query()->create([
            'office_id' => $station->office_id,
            'station_id' => $station->id,
            'name' => $data['name'],
            'active' => $data['active'] ?? true,
        ]);

        return response()->json($dept->load(['office:id,name', 'station:id,name']), 201);
    }

    public function update(Request $request, Department $department): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->access->assertRegistrar($user);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'active' => ['sometimes', 'boolean'],
            'station_id' => ['sometimes', 'integer', Rule::exists('stations', 'id')->where('active', true)],
        ]);

        $stationId = $data['station_id'] ?? $department->station_id;
        if (! $stationId) {
            throw ValidationException::withMessages([
                'station_id' => 'Choose the station this department belongs to.',
            ]);
        }
        $station = Station::query()->findOrFail($stationId);
        $name = $data['name'] ?? $department->name;
        $clash = Department::query()
            ->where('station_id', $station->id)
            ->where('name', $name)
            ->whereKeyNot($department->id)
            ->exists();
        if ($clash) {
            throw ValidationException::withMessages([
                'name' => 'A department with this name already exists in that station.',
            ]);
        }

        $department->fill([
            'name' => $name,
            'station_id' => $station->id,
            'office_id' => $station->office_id,
            'active' => $data['active'] ?? $department->active,
        ])->save();

        return response()->json($department->fresh()->load(['office:id,name', 'station:id,name']));
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
                    'name' => 'A region with this name already exists.',
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
            return response()->json(['message' => 'Cannot delete the last region.'], 422);
        }

        $office->forceFill(['active' => false])->save();

        return response()->json(['message' => 'Region deleted.']);
    }
}
