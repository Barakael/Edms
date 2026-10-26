<?php

namespace App\Http\Controllers;

use App\Models\EmailDraft;
use App\Models\User;
use App\Services\DocumentAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmailDraftController extends Controller
{
    public function __construct(private DocumentAccessService $access) {}

    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->access->assertRegistrar($user);

        $drafts = EmailDraft::query()
            ->with(['message', 'document.registration'])
            ->where('status', 'pending')
            ->orderByDesc('id')
            ->paginate(25);

        return response()->json($drafts);
    }

    public function claim(Request $request, EmailDraft $emailDraft): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->access->assertRegistrar($user);

        if ($emailDraft->status !== 'pending') {
            return response()->json(['message' => 'Draft already claimed.'], 422);
        }

        $emailDraft->forceFill([
            'claimed_by' => $user->id,
            'claimed_at' => now(),
            'status' => 'claimed',
        ])->save();

        return response()->json($emailDraft->load(['message', 'document.registration', 'document.files']));
    }
}
