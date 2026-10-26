<?php

namespace App\Http\Controllers;

use App\Models\Document;
use App\Models\DocumentFile;
use App\Models\DocumentSignaturePlacement;
use App\Models\OtpChallenge;
use App\Models\Signature;
use App\Models\SignatureCaptureSession;
use App\Models\User;
use App\Models\WorkflowEvent;
use App\Services\DocumentAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class SignatureController extends Controller
{
    public function __construct(private DocumentAccessService $access) {}

    public function storeProfile(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $data = $request->validate([
            'ink_data' => ['required', 'string'],
            'capture_source' => ['required', Rule::in(['usb_pad', 'iphone', 'pointer'])],
            'device_metadata' => ['nullable', 'array'],
        ]);

        Signature::query()
            ->where('user_id', $user->id)
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);

        $signature = Signature::query()->create([
            'user_id' => $user->id,
            'ink_data' => $data['ink_data'],
            'capture_source' => $data['capture_source'],
            'device_metadata' => $data['device_metadata'] ?? null,
        ]);

        return response()->json($signature, 201);
    }

    public function showProfile(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $sig = $user->activeSignature;

        return response()->json(['signature' => $sig]);
    }

    public function place(Request $request, Document $document): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->access->assertCanActOnWorkflow($user, $document);

        $data = $request->validate([
            'document_file_id' => ['required', 'exists:document_files,id'],
            'page' => ['required', 'integer', 'min:1'],
            'x_pct' => ['required', 'numeric', 'min:0', 'max:100'],
            'y_pct' => ['required', 'numeric', 'min:0', 'max:100'],
            'sign_token' => ['nullable', 'string'],
        ]);

        if ($user->signature_2fa_enabled) {
            $otp = OtpChallenge::query()
                ->where('user_id', $user->id)
                ->where('purpose', 'sign')
                ->where('sign_token', $data['sign_token'] ?? '')
                ->where('expires_at', '>', now())
                ->first();

            if (! $otp) {
                return response()->json(['message' => 'Valid signature OTP required. Request and verify a code first.'], 403);
            }

            // One-time use of sign token after successful placement
            $otp->forceFill(['sign_token' => null])->save();
        }

        $file = DocumentFile::query()->findOrFail($data['document_file_id']);
        if ((int) $file->document_id !== (int) $document->id) {
            return response()->json(['message' => 'File does not belong to document.'], 422);
        }

        $signature = $user->activeSignature;
        if (! $signature) {
            return response()->json(['message' => 'Capture a signature in your profile first.'], 422);
        }

        $placement = DocumentSignaturePlacement::query()->create([
            'document_id' => $document->id,
            'document_file_id' => $file->id,
            'user_id' => $user->id,
            'signature_id' => $signature->id,
            'page' => $data['page'],
            'x_pct' => $data['x_pct'],
            'y_pct' => $data['y_pct'],
            'placed_at' => now(),
        ]);

        WorkflowEvent::query()->create([
            'document_id' => $document->id,
            'from_user_id' => $user->id,
            'action' => 'sign',
            'payload' => [
                'placement_id' => $placement->id,
                'capture_source' => $signature->capture_source,
            ],
            'created_at' => now(),
        ]);

        return response()->json($placement->load('signature'), 201);
    }

    public function move(Request $request, Document $document, DocumentSignaturePlacement $placement): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->assertCanEditPlacement($user, $document, $placement);

        $data = $request->validate([
            'x_pct' => ['required', 'numeric', 'min:0', 'max:100'],
            'y_pct' => ['required', 'numeric', 'min:0', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);

        $placement->forceFill([
            'x_pct' => $data['x_pct'],
            'y_pct' => $data['y_pct'],
            'page' => $data['page'] ?? $placement->page,
        ])->save();

        WorkflowEvent::query()->create([
            'document_id' => $document->id,
            'from_user_id' => $user->id,
            'action' => 'sign_moved',
            'payload' => ['placement_id' => $placement->id],
            'created_at' => now(),
        ]);

        return response()->json($placement->load('signature'));
    }

    public function destroyPlacement(Request $request, Document $document, DocumentSignaturePlacement $placement): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->assertCanEditPlacement($user, $document, $placement);

        $id = $placement->id;
        $placement->delete();

        WorkflowEvent::query()->create([
            'document_id' => $document->id,
            'from_user_id' => $user->id,
            'action' => 'sign_removed',
            'payload' => ['placement_id' => $id],
            'created_at' => now(),
        ]);

        return response()->json(['message' => 'Signature removed.']);
    }

    private function assertCanEditPlacement(User $user, Document $document, DocumentSignaturePlacement $placement): void
    {
        if ((int) $placement->document_id !== (int) $document->id) {
            abort(404);
        }

        if ($document->status === Document::STATUS_CLOSED) {
            abort(403, 'Document is closed.');
        }

        if ($user->isRegistrar()) {
            return;
        }

        if ((int) $placement->user_id !== (int) $user->id) {
            abort(403, 'You can only edit your own signature placements.');
        }

        $this->access->assertCanActOnWorkflow($user, $document);
    }

    public function startIphoneSession(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $token = Str::random(48);

        $session = SignatureCaptureSession::query()->create([
            'user_id' => $user->id,
            'token' => $token,
            'status' => 'pending',
            'expires_at' => now()->addMinutes(10),
        ]);

        return response()->json([
            'session_id' => $session->id,
            'token' => $token,
            'expires_at' => $session->expires_at,
            'capture_path' => '/sign-pad/'.$token,
        ]);
    }

    public function iphoneSessionStatus(Request $request, string $token): JsonResponse
    {
        $session = SignatureCaptureSession::query()->where('token', $token)->firstOrFail();
        if ($session->expires_at->isPast()) {
            return response()->json(['status' => 'expired']);
        }

        return response()->json([
            'status' => $session->status,
            'ink_data' => $session->status === 'completed' ? $session->ink_data : null,
        ]);
    }

    public function submitIphoneCapture(Request $request, string $token): JsonResponse
    {
        $session = SignatureCaptureSession::query()->where('token', $token)->firstOrFail();
        if ($session->expires_at->isPast()) {
            return response()->json(['message' => 'Session expired.'], 410);
        }

        $data = $request->validate([
            'ink_data' => ['required', 'string'],
        ]);

        $session->forceFill([
            'ink_data' => $data['ink_data'],
            'status' => 'completed',
        ])->save();

        return response()->json(['message' => 'Signature received.']);
    }
}
