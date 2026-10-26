<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\Office;
use App\Models\User;
use App\Services\DocumentAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
            'office_id' => ['required', 'exists:offices,id'],
            'name' => ['required', 'string', 'max:255'],
            'active' => ['sometimes', 'boolean'],
        ]);

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

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'active' => ['sometimes', 'boolean'],
            'office_id' => ['sometimes', 'exists:offices,id'],
        ]);

        $department->fill($data)->save();

        return response()->json($department->fresh()->load('office:id,name'));
    }
}
