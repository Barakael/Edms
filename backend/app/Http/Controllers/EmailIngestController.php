<?php

namespace App\Http\Controllers;

use App\Services\EmailIngestService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmailIngestController extends Controller
{
    public function __construct(private EmailIngestService $ingest) {}

    /**
     * Webhook / internal endpoint for inbound mail to info@…
     */
    public function ingest(Request $request): JsonResponse
    {
        $secret = config('edms.email_ingest_secret', env('EDMS_EMAIL_INGEST_SECRET'));
        if ($secret && $request->header('X-EDMS-Ingest-Secret') !== $secret) {
            return response()->json(['message' => 'Unauthorized ingest.'], 401);
        }

        $data = $request->validate([
            'message_id' => ['required', 'string', 'max:255'],
            'from' => ['nullable', 'string', 'max:255'],
            'subject' => ['nullable', 'string', 'max:500'],
            'received_at' => ['nullable', 'date'],
            'attachments' => ['nullable', 'array'],
            'attachments.*.filename' => ['required_with:attachments', 'string'],
            'attachments.*.mime' => ['required_with:attachments', 'string'],
            'attachments.*.contents' => ['required_with:attachments', 'string'],
        ]);

        $draft = $this->ingest->ingest($data);

        return response()->json(['draft' => $draft->load(['message', 'document.files'])], 201);
    }
}
