<?php

namespace App\Services;

use App\Models\Document;
use App\Models\DocumentFile;
use App\Models\DocumentRegistration;
use App\Models\EmailDraft;
use App\Models\EmailIngestMessage;
use App\Models\User;
use App\Models\WorkflowEvent;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class EmailIngestService
{
    public function __construct(private AuditLogger $audit) {}

    /**
     * Ingest a parsed inbound message into a registrar-owned draft document.
     *
     * @param  array{message_id:string,from?:string,subject?:string,received_at?:string,attachments?:list<array{filename:string,mime:string,contents:string}>}  $payload
     */
    public function ingest(array $payload): EmailDraft
    {
        if (EmailIngestMessage::query()->where('message_id', $payload['message_id'])->exists()) {
            $existing = EmailIngestMessage::query()->where('message_id', $payload['message_id'])->firstOrFail();

            return $existing->draft ?? EmailDraft::query()->where('email_ingest_message_id', $existing->id)->firstOrFail();
        }

        $registrar = User::query()->where('role', User::ROLE_REGISTRAR)->where('active', true)->first();

        try {
            return DB::transaction(function () use ($payload, $registrar) {
                $message = EmailIngestMessage::query()->create([
                    'message_id' => $payload['message_id'],
                    'from_address' => $payload['from'] ?? null,
                    'subject' => $payload['subject'] ?? null,
                    'received_at' => $payload['received_at'] ?? now(),
                    'status' => 'parsed',
                    'raw_refs' => null,
                ]);

                $document = Document::query()->create([
                'status' => Document::STATUS_DRAFT,
                'box' => Document::BOX_PREVIEW,
                'sensitivity' => Document::SENSITIVITY_NORMAL,
                    'created_by' => $registrar?->id ?? User::query()->firstOrFail()->id,
                ]);

                DocumentRegistration::query()->create([
                    'document_id' => $document->id,
                    'mail_subject_type' => $payload['subject'] ?? 'inbound_email',
                    'mail_type' => 'EMAIL',
                    'mail_subject' => $payload['subject'] ?? 'inbound_email',
                    'mail_priority' => 'normal',
                    'sender_or_origin' => $payload['from'] ?? null,
                    'received_date' => now()->toDateString(),
                    'reference_number' => null,
                ]);

                $disk = config('edms.storage_disk', 'edms');
                $order = 0;
                foreach ($payload['attachments'] ?? [] as $attachment) {
                    $mime = $attachment['mime'] ?? 'application/octet-stream';
                    if (! Str::startsWith($mime, ['application/pdf', 'image/'])) {
                        continue;
                    }
                    $order++;
                    $binary = base64_decode($attachment['contents'], true);
                    if ($binary === false) {
                        $binary = $attachment['contents'];
                    }
                    $path = 'documents/'.$document->id.'/'.Str::uuid().'_'.$attachment['filename'];
                    Storage::disk($disk)->put($path, $binary);

                    DocumentFile::query()->create([
                        'document_id' => $document->id,
                        'sort_order' => $order,
                        'original_filename' => $attachment['filename'],
                        'storage_path' => $path,
                        'mime' => $mime,
                        'checksum' => hash('sha256', $binary),
                        'size_bytes' => strlen($binary),
                    ]);
                }

                WorkflowEvent::query()->create([
                    'document_id' => $document->id,
                    'from_user_id' => $registrar?->id,
                    'action' => 'email_ingest',
                    'payload' => ['message_id' => $message->message_id],
                    'created_at' => now(),
                ]);

                $message->forceFill(['status' => 'draft_created'])->save();

                $draft = EmailDraft::query()->create([
                    'email_ingest_message_id' => $message->id,
                    'document_id' => $document->id,
                    'status' => 'pending',
                ]);

                $this->audit->log($registrar, 'email_ingest', 'email_draft', (string) $draft->id, 'success', [
                    'message_id' => $message->message_id,
                ]);

                return $draft;
            });
        } catch (\Throwable $e) {
            EmailIngestMessage::query()->updateOrCreate(
                ['message_id' => $payload['message_id']],
                [
                    'from_address' => $payload['from'] ?? null,
                    'subject' => $payload['subject'] ?? null,
                    'received_at' => $payload['received_at'] ?? now(),
                    'status' => 'failed',
                    'failure_reason' => $e->getMessage(),
                ]
            );
            $this->audit->log(null, 'email_ingest_failed', 'email', $payload['message_id'], 'denied', [
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}
