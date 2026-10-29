<?php

namespace App\Http\Controllers;

use App\Models\Office;
use App\Models\Station;
use App\Models\User;
use App\Services\DocumentAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class StationController extends Controller
{
    public function __construct(private DocumentAccessService $access) {}

    public function index(Request $request): JsonResponse
    {
        $query = Station::query()->with('office:id,name')->orderBy('name');
        if ($request->filled('office_id')) {
            $query->where('office_id', $request->integer('office_id'));
        }
        if (! $request->boolean('include_inactive')) {
            $query->where('active', true);
        }

        return response()->json(['stations' => $query->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->access->assertRegistrar($user);

        $data = $request->validate([
            'office_id' => ['required', 'integer', Rule::exists('offices', 'id')->where('active', true)],
            'name' => ['required', 'string', 'max:255'],
        ]);

        $existing = Station::query()
            ->where('office_id', $data['office_id'])
            ->where('name', $data['name'])
            ->first();

        if ($existing) {
            if ($existing->active) {
                throw ValidationException::withMessages([
                    'name' => 'A station with this name already exists in that region.',
                ]);
            }
            $existing->forceFill(['active' => true])->save();

            return response()->json($existing->load('office:id,name'), 201);
        }

        $station = Station::query()->create([
            'office_id' => $data['office_id'],
            'name' => $data['name'],
            'active' => true,
        ]);

        return response()->json($station->load('office:id,name'), 201);
    }

    public function update(Request $request, Station $station): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->access->assertRegistrar($user);

        $officeId = $request->input('office_id', $station->office_id);
        $data = $request->validate([
            'name' => [
                'sometimes',
                'string',
                'max:255',
                Rule::unique('stations', 'name')->where('office_id', $officeId)->ignore($station->id),
            ],
            'office_id' => ['sometimes', 'integer', Rule::exists('offices', 'id')->where('active', true)],
            'active' => ['sometimes', 'boolean'],
        ]);

        $station->fill($data)->save();

        return response()->json($station->fresh()->load('office:id,name'));
    }

    public function destroy(Request $request, Station $station): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->access->assertRegistrar($user);
        $station->forceFill(['active' => false])->save();

        return response()->json(['message' => 'Station deleted.']);
    }
}
