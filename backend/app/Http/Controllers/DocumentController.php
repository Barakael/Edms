<?php

namespace App\Http\Controllers;

use App\Mail\DocumentAssignedMail;
use App\Models\AppNotification;
use App\Models\Department;
use App\Models\Document;
use App\Models\DocumentFile;
use App\Models\DocumentRegistration;
use App\Models\DocumentRouteStep;
use App\Models\User;
use App\Models\WorkflowEvent;
use App\Services\AuditLogger;
use App\Services\DocumentAccessService;
use App\Services\Sms\SmsSender;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\Rule;

class DocumentController extends Controller
{
    public function __construct(
        private DocumentAccessService $access,
        private AuditLogger $audit,
        private SmsSender $sms,
    ) {}

    public function inbox(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $query = Document::query()
            ->with(['registration.departmentRelation', 'currentAssignee:id,name,role', 'submitter:id,name', 'files'])
            ->whereNull('deleted_at');

        if ($user->isRegistrar() && $request->boolean('all')) {
            // all docs
        } elseif ($user->isRegistrar() && $request->boolean('queue')) {
            $query->where(function ($q) {
                $q->where('awaiting_registry', true)
                    ->orWhere('status', Document::STATUS_PENDING_REGISTRY);
            });
        } else {
            $query->where(function ($q) use ($user) {
                $q->where('current_assignee_id', $user->id)
                    ->orWhere(function ($q2) use ($user) {
                        $q2->where('submitted_by', $user->id)
                            ->where('status', Document::STATUS_PENDING_REGISTRY);
                    });
            });
        }

        $this->applyFilters($query, $request);

        return response()->json($query->orderByDesc('updated_at')->paginate(25));
    }

    public function search(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $query = Document::query()
            ->with(['registration.departmentRelation', 'currentAssignee:id,name,role'])
            ->whereNull('deleted_at');

        if (! $user->isRegistrar()) {
            $query->where(function ($q) use ($user) {
                $q->where('current_assignee_id', $user->id)
                    ->orWhere('submitted_by', $user->id);
            });
        }

        $field = $request->string('field')->toString();
        $value = $request->string('q')->toString();

        $allowed = [
            'mail_subject_type',
            'reference_number',
            'file_number',
            'folio_number',
            'sender_or_origin',
            'received_date',
            'classification',
            'department',
        ];

        if ($field === 'department_id' && $value !== '') {
            $query->whereHas('registration', fn ($q) => $q->where('department_id', $value));
        } elseif ($field && $value !== '' && in_array($field, $allowed, true)) {
            $query->whereHas('registration', function ($q) use ($field, $value) {
                if ($field === 'received_date') {
                    $q->whereDate('received_date', $value);
                } elseif ($field === 'department') {
                    $q->where(function ($q2) use ($value) {
                        $q2->where('department', 'like', $value.'%')
                            ->orWhereHas('departmentRelation', fn ($d) => $d->where('name', 'like', $value.'%'));
                    });
                } else {
                    $q->where($field, 'like', $value.'%');
                }
            });
        }

        $this->applyFilters($query, $request);

        return response()->json($query->orderByDesc('updated_at')->paginate(25));
    }

    public function store(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $isRegistrar = $user->isRegistrar();
        $submitToRegistry = $request->boolean('submit_to_registry') || ! $isRegistrar;

        if (! $isRegistrar && ! $submitToRegistry) {
            return response()->json(['message' => 'Members must submit to registry.'], 403);
        }

        $data = $request->validate([
            'mail_subject_type' => ['nullable', 'string', 'max:255'],
            'reference_number' => ['nullable', 'string', 'max:255', 'unique:document_registrations,reference_number'],
            'file_number' => ['nullable', 'string', 'max:255'],
            'folio_number' => ['nullable', 'string', 'max:255'],
            'sender_or_origin' => ['nullable', 'string', 'max:255'],
            'received_date' => ['nullable', 'date'],
            'classification' => ['nullable', 'string', 'max:255'],
            'department_id' => ['nullable', 'exists:departments,id'],
            'comment' => ['nullable', 'string', 'max:5000'],
            'sensitivity' => ['nullable', Rule::in([Document::SENSITIVITY_NORMAL, Document::SENSITIVITY_BANK])],
            'status' => ['nullable', Rule::in([Document::STATUS_DRAFT, Document::STATUS_REGISTERED, Document::STATUS_PENDING_REGISTRY])],
            'files' => ['nullable', 'array'],
            'files.*' => ['file', 'max:51200', 'mimetypes:application/pdf,image/jpeg,image/png,image/webp'],
            'route_user_ids' => ['nullable', 'array'],
            'route_user_ids.*' => ['integer', 'exists:users,id'],
        ]);

        $deptName = null;
        if (! empty($data['department_id'])) {
            $deptName = Department::query()->find($data['department_id'])?->name;
        }

        $status = $submitToRegistry && ! $isRegistrar
            ? Document::STATUS_PENDING_REGISTRY
            : ($data['status'] ?? Document::STATUS_DRAFT);

        if ($isRegistrar && ($data['status'] ?? null) === Document::STATUS_PENDING_REGISTRY) {
            $status = Document::STATUS_PENDING_REGISTRY;
        }

        $document = DB::transaction(function () use ($data, $user, $request, $deptName, $status, $submitToRegistry, $isRegistrar) {
            $document = Document::query()->create([
                'status' => $status,
                'sensitivity' => $data['sensitivity'] ?? Document::SENSITIVITY_NORMAL,
                'created_by' => $isRegistrar ? $user->id : ($user->id),
                'submitted_by' => $submitToRegistry && ! $isRegistrar ? $user->id : null,
                'awaiting_registry' => $status === Document::STATUS_PENDING_REGISTRY,
            ]);

            DocumentRegistration::query()->create([
                'document_id' => $document->id,
                'mail_subject_type' => $data['mail_subject_type'] ?? null,
                'reference_number' => $data['reference_number'] ?? null,
                'file_number' => $data['file_number'] ?? null,
                'folio_number' => $data['folio_number'] ?? null,
                'sender_or_origin' => $data['sender_or_origin'] ?? null,
                'received_date' => $data['received_date'] ?? null,
                'classification' => $data['classification'] ?? null,
                'department' => $deptName,
                'department_id' => $data['department_id'] ?? null,
            ]);

            $this->storeFiles($document, $request);

            WorkflowEvent::query()->create([
                'document_id' => $document->id,
                'from_user_id' => $user->id,
                'action' => $status === Document::STATUS_PENDING_REGISTRY ? 'member_submit' : 'create',
                'payload' => ['status' => $document->status],
                'created_at' => now(),
            ]);

            if (! empty($data['comment'])) {
                $comment = $document->comments()->create([
                    'user_id' => $user->id,
                    'body' => $data['comment'],
                    'created_at' => now(),
                ]);
                WorkflowEvent::query()->create([
                    'document_id' => $document->id,
                    'from_user_id' => $user->id,
                    'action' => 'comment',
                    'payload' => ['comment_id' => $comment->id],
                    'created_at' => now(),
                ]);
            }

            if ($isRegistrar && ! empty($data['route_user_ids'])) {
                foreach (array_values($data['route_user_ids']) as $i => $uid) {
                    DocumentRouteStep::query()->create([
                        'document_id' => $document->id,
                        'user_id' => $uid,
                        'position' => $i,
                    ]);
                }
            }

            return $document;
        });

        $this->audit->log($user, 'document_create', 'document', (string) $document->id, 'success', null, $request);

        return response()->json($document->load(['registration.departmentRelation', 'files', 'routeSteps.user:id,name']), 201);
    }

    public function show(Request $request, Document $document): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->access->assertCanViewContent($user, $document, $request);

        $document->load([
            'registration.departmentRelation',
            'files',
            'comments.user:id,name,role',
            'workflowEvents.fromUser:id,name',
            'workflowEvents.toUser:id,name',
            'signaturePlacements.signature',
            'signaturePlacements.user:id,name',
            'currentAssignee:id,name,role',
            'creator:id,name,role',
            'submitter:id,name,role',
            'routeSteps.user:id,name,role',
        ]);

        return response()->json([
            'document' => $document,
            'pipeline' => $this->buildPipeline($document),
            'watermark_name' => $user->name,
            'can_download' => $this->access->canDownload($user, $document),
            'assignee_can_download' => (bool) $document->assignee_can_download,
            'disclaimer' => 'Browsers cannot truly block OS-level or device screenshots; watermarks exist for accountability after the fact, not prevention.',
        ]);
    }

    public function setDownloadPermission(Request $request, Document $document): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->access->assertRegistrar($user);

        $data = $request->validate([
            'assignee_can_download' => ['required', 'boolean'],
        ]);

        $document->forceFill([
            'assignee_can_download' => $data['assignee_can_download'],
        ])->save();

        WorkflowEvent::query()->create([
            'document_id' => $document->id,
            'from_user_id' => $user->id,
            'action' => $data['assignee_can_download'] ? 'download_granted' : 'download_revoked',
            'payload' => [
                'assignee_id' => $document->current_assignee_id,
            ],
            'created_at' => now(),
        ]);

        $this->audit->log($user, 'document_download_permission', 'document', (string) $document->id, 'success', [
            'assignee_can_download' => $data['assignee_can_download'],
        ], $request);

        return response()->json([
            'document_id' => $document->id,
            'assignee_can_download' => (bool) $document->assignee_can_download,
            'can_download' => $this->access->canDownload($user, $document->fresh()),
        ]);
    }

    public function update(Request $request, Document $document): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->access->assertRegistrar($user);

        $data = $request->validate([
            'mail_subject_type' => ['nullable', 'string', 'max:255'],
            'reference_number' => [
                'nullable',
                'string',
                'max:255',
                Rule::unique('document_registrations', 'reference_number')->ignore($document->registration?->id),
            ],
            'file_number' => ['nullable', 'string', 'max:255'],
            'folio_number' => ['nullable', 'string', 'max:255'],
            'sender_or_origin' => ['nullable', 'string', 'max:255'],
            'received_date' => ['nullable', 'date'],
            'classification' => ['nullable', 'string', 'max:255'],
            'department_id' => ['nullable', 'exists:departments,id'],
            'sensitivity' => ['nullable', Rule::in([Document::SENSITIVITY_NORMAL, Document::SENSITIVITY_BANK])],
            'status' => ['nullable', Rule::in([
                Document::STATUS_DRAFT,
                Document::STATUS_PENDING_REGISTRY,
                Document::STATUS_REGISTERED,
                Document::STATUS_IN_CIRCULATION,
                Document::STATUS_CLOSED,
            ])],
            'files' => ['nullable', 'array'],
            'files.*' => ['file', 'max:51200', 'mimetypes:application/pdf,image/jpeg,image/png,image/webp'],
            'route_user_ids' => ['nullable', 'array'],
            'route_user_ids.*' => ['integer', 'exists:users,id'],
        ]);

        $before = $document->registration?->toArray();

        DB::transaction(function () use ($document, $data, $user, $request, $before) {
            if (isset($data['sensitivity'])) {
                $document->sensitivity = $data['sensitivity'];
            }
            if (isset($data['status'])) {
                $document->status = $data['status'];
                $document->awaiting_registry = $data['status'] === Document::STATUS_PENDING_REGISTRY;
            }
            $document->save();

            $reg = $document->registration ?? new DocumentRegistration(['document_id' => $document->id]);
            foreach ([
                'mail_subject_type', 'reference_number', 'file_number', 'folio_number',
                'sender_or_origin', 'received_date', 'classification', 'department_id',
            ] as $field) {
                if (array_key_exists($field, $data)) {
                    $reg->{$field} = $data[$field];
                }
            }
            if (array_key_exists('department_id', $data)) {
                $reg->department = $data['department_id']
                    ? Department::query()->find($data['department_id'])?->name
                    : null;
            }
            $reg->save();

            $this->storeFiles($document, $request);

            if (array_key_exists('route_user_ids', $data)) {
                DocumentRouteStep::query()->where('document_id', $document->id)->delete();
                foreach (array_values($data['route_user_ids'] ?? []) as $i => $uid) {
                    DocumentRouteStep::query()->create([
                        'document_id' => $document->id,
                        'user_id' => $uid,
                        'position' => $i,
                    ]);
                }
            }

            WorkflowEvent::query()->create([
                'document_id' => $document->id,
                'from_user_id' => $user->id,
                'action' => 'update_meta',
                'payload' => ['before' => $before, 'after' => $reg->fresh()->toArray()],
                'created_at' => now(),
            ]);
        });

        $this->audit->log($user, 'document_update', 'document', (string) $document->id, 'success', null, $request);

        return response()->json($document->fresh()->load(['registration.departmentRelation', 'files', 'routeSteps.user:id,name']));
    }

    public function destroy(Request $request, Document $document): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->access->assertRegistrar($user);

        WorkflowEvent::query()->create([
            'document_id' => $document->id,
            'from_user_id' => $user->id,
            'action' => 'delete',
            'payload' => null,
            'created_at' => now(),
        ]);

        $document->delete();
        $this->audit->log($user, 'document_delete', 'document', (string) $document->id, 'success', null, $request);

        return response()->json(['message' => 'Document soft-deleted.']);
    }

    public function assign(Request $request, Document $document): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $data = $request->validate([
            'assignee_id' => ['required', 'exists:users,id'],
        ]);

        if ($document->status === Document::STATUS_CLOSED) {
            return response()->json(['message' => 'Closed documents cannot be reassigned.'], 422);
        }

        // Pending registry: only registrar may distribute
        if ($document->status === Document::STATUS_PENDING_REGISTRY || $document->awaiting_registry) {
            if (! $user->isRegistrar()) {
                return response()->json(['message' => 'Only registry can distribute pending documents.'], 403);
            }
        }

        $isPush = (int) $document->current_assignee_id === (int) $user->id;
        if (! $user->isRegistrar() && ! $isPush) {
            return response()->json(['message' => 'Only the assignee or registrar can route this document.'], 403);
        }

        $assignee = User::query()->findOrFail($data['assignee_id']);
        if (! $assignee->active) {
            return response()->json(['message' => 'Assignee is inactive.'], 422);
        }

        $action = $document->current_assignee_id ? 'push' : 'assign';

        $document->forceFill([
            'current_assignee_id' => $assignee->id,
            'status' => Document::STATUS_IN_CIRCULATION,
            'awaiting_registry' => false,
        ])->save();

        // Ensure route step includes assignee
        $maxPos = (int) DocumentRouteStep::query()->where('document_id', $document->id)->max('position');
        $exists = DocumentRouteStep::query()
            ->where('document_id', $document->id)
            ->where('user_id', $assignee->id)
            ->exists();
        if (! $exists) {
            DocumentRouteStep::query()->create([
                'document_id' => $document->id,
                'user_id' => $assignee->id,
                'position' => $maxPos + 1,
            ]);
        }

        WorkflowEvent::query()->create([
            'document_id' => $document->id,
            'from_user_id' => $user->id,
            'to_user_id' => $assignee->id,
            'action' => $action,
            'payload' => null,
            'created_at' => now(),
        ]);

        $ref = $document->registration?->reference_number ?: '#'.$document->id;
        AppNotification::query()->create([
            'user_id' => $assignee->id,
            'document_id' => $document->id,
            'type' => 'assignment',
            'title' => 'Document assigned',
            'body' => "You were assigned document {$ref}",
        ]);

        try {
            Mail::to($assignee->email)->send(new DocumentAssignedMail($document->load('registration'), $assignee));
        } catch (\Throwable $e) {
            $this->audit->log($user, 'assignment_mail_failed', 'document', (string) $document->id, 'denied', [
                'error' => $e->getMessage(),
                'to' => $assignee->id,
            ], $request);
        }

        if ($assignee->phone) {
            $this->sms->send(
                $assignee->phone,
                "EDMS: document {$ref} assigned to you. Open the app to review."
            );
        }

        $this->audit->log($user, 'document_'.$action, 'document', (string) $document->id, 'success', [
            'to' => $assignee->id,
        ], $request);

        return response()->json($document->fresh()->load(['registration', 'currentAssignee:id,name,role', 'routeSteps.user:id,name']));
    }

    public function comment(Request $request, Document $document): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->access->assertCanComment($user, $document);

        $data = $request->validate([
            'body' => ['required', 'string', 'max:5000'],
        ]);

        $comment = $document->comments()->create([
            'user_id' => $user->id,
            'body' => $data['body'],
            'created_at' => now(),
        ]);

        WorkflowEvent::query()->create([
            'document_id' => $document->id,
            'from_user_id' => $user->id,
            'action' => 'comment',
            'payload' => ['comment_id' => $comment->id],
            'created_at' => now(),
        ]);

        return response()->json($comment->load('user:id,name,role'), 201);
    }

    public function close(Request $request, Document $document): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->access->assertCanActOnWorkflow($user, $document);

        if (! $user->isDirector() && $user->role !== User::ROLE_ADMIN) {
            return response()->json(['message' => 'Only directors can close documents.'], 403);
        }

        $document->forceFill([
            'status' => Document::STATUS_CLOSED,
            'closed_at' => now(),
        ])->save();

        WorkflowEvent::query()->create([
            'document_id' => $document->id,
            'from_user_id' => $user->id,
            'action' => 'close',
            'payload' => null,
            'created_at' => now(),
        ]);

        return response()->json($document->fresh());
    }

    public function pipeline(Request $request, Document $document): JsonResponse
    {
        $this->access->assertCanViewContent($request->user(), $document, $request);
        $document->load(['routeSteps.user:id,name', 'workflowEvents', 'currentAssignee:id,name']);

        return response()->json(['pipeline' => $this->buildPipeline($document)]);
    }

    private function buildPipeline(Document $document): array
    {
        $visited = [];
        foreach ($document->workflowEvents as $ev) {
            if (in_array($ev->action, ['assign', 'push'], true) && $ev->to_user_id) {
                $visited[(int) $ev->to_user_id] = true;
            }
        }

        $steps = $document->routeSteps;
        if ($steps->isEmpty() && $document->current_assignee_id) {
            return [[
                'user_id' => $document->current_assignee_id,
                'name' => $document->currentAssignee?->name ?? 'Assignee',
                'state' => 'current',
            ]];
        }

        $out = [];
        foreach ($steps as $step) {
            $uid = (int) $step->user_id;
            $state = 'pending';
            if ((int) $document->current_assignee_id === $uid && $document->status !== Document::STATUS_CLOSED) {
                $state = 'current';
            } elseif (isset($visited[$uid]) && (int) $document->current_assignee_id !== $uid) {
                $state = 'done';
            } elseif ($document->status === Document::STATUS_CLOSED && isset($visited[$uid])) {
                $state = 'done';
            } elseif (isset($visited[$uid]) && (int) $document->current_assignee_id === $uid) {
                $state = 'current';
            }
            // Past assignees who already pushed: done even if still in visited and not current
            if ($state === 'pending' && isset($visited[$uid]) && (int) $document->current_assignee_id !== $uid) {
                $state = 'done';
            }
            if ($state === 'current' && isset($visited[$uid]) === false && (int) $document->current_assignee_id === $uid) {
                $state = 'current';
            }
            $out[] = [
                'user_id' => $uid,
                'name' => $step->user?->name ?? 'User',
                'state' => $state,
                'position' => $step->position,
            ];
        }

        // Fix: anyone visited who is not current → done
        foreach ($out as &$row) {
            if ($row['state'] !== 'current' && isset($visited[$row['user_id']])) {
                if ((int) $document->current_assignee_id !== (int) $row['user_id']) {
                    $row['state'] = 'done';
                }
            }
        }
        unset($row);

        return $out;
    }

    private function applyFilters($query, Request $request): void
    {
        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }
        if ($request->filled('sensitivity')) {
            $query->where('sensitivity', $request->string('sensitivity'));
        }
        if ($request->filled('from')) {
            $query->whereDate('created_at', '>=', $request->date('from'));
        }
        if ($request->filled('to')) {
            $query->whereDate('created_at', '<=', $request->date('to'));
        }
    }

    private function storeFiles(Document $document, Request $request): void
    {
        if (! $request->hasFile('files')) {
            return;
        }

        $disk = config('edms.storage_disk', 'edms');
        $order = (int) $document->files()->max('sort_order');

        foreach ($request->file('files') as $uploaded) {
            $order++;
            $path = $uploaded->store('documents/'.$document->id, $disk);
            $checksum = hash_file('sha256', $uploaded->getRealPath());

            DocumentFile::query()->create([
                'document_id' => $document->id,
                'sort_order' => $order,
                'original_filename' => $uploaded->getClientOriginalName(),
                'storage_path' => $path,
                'mime' => $uploaded->getMimeType() ?: 'application/octet-stream',
                'page_count' => null,
                'checksum' => $checksum,
                'size_bytes' => $uploaded->getSize() ?: 0,
            ]);
        }
    }
}
