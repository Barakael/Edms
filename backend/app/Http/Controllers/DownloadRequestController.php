<?php

namespace App\Http\Controllers;

use App\Models\DownloadRequest;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\DocumentAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DownloadRequestController extends Controller
{
    public function __construct(
        private DocumentAccessService $access,
        private AuditLogger $audit,
    ) {}

    public function mine(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'can_download' => (bool) $user->can_download,
            'requests' => DownloadRequest::query()
                ->where('user_id', $user->id)
                ->orderByDesc('id')
                ->limit(20)
                ->get(),
        ]);
    }

    public function requestAccess(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($user->can_download) {
            return response()->json(['message' => 'Download already granted.'], 422);
        }

        $pending = DownloadRequest::query()
            ->where('user_id', $user->id)
            ->where('status', 'pending')
            ->exists();

        if ($pending) {
            return response()->json(['message' => 'A request is already pending.'], 422);
        }

        $data = $request->validate([
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $row = DownloadRequest::query()->create([
            'user_id' => $user->id,
            'status' => 'pending',
            'notes' => $data['notes'] ?? null,
        ]);

        return response()->json($row, 201);
    }

    public function index(Request $request): JsonResponse
    {
        $this->access->assertRegistrar($request->user());

        $rows = DownloadRequest::query()
            ->with(['user:id,name,email,can_download', 'reviewer:id,name'])
            ->orderByDesc('id')
            ->paginate(50);

        return response()->json($rows);
    }

    public function review(Request $request, DownloadRequest $downloadRequest): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->access->assertRegistrar($actor);

        $data = $request->validate([
            'status' => ['required', 'in:approved,denied'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $downloadRequest->forceFill([
            'status' => $data['status'],
            'notes' => $data['notes'] ?? $downloadRequest->notes,
            'reviewed_by' => $actor->id,
            'reviewed_at' => now(),
        ])->save();

        if ($data['status'] === 'approved') {
            $downloadRequest->user->forceFill(['can_download' => true])->save();
        }

        $this->audit->log($actor, 'download_request_'.$data['status'], 'user', (string) $downloadRequest->user_id, 'success', null, $request);

        return response()->json($downloadRequest->fresh()->load(['user:id,name,email,can_download', 'reviewer:id,name']));
    }
}
