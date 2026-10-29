<?php

namespace App\Http\Controllers;

use App\Mail\DocumentAssignedMail;
use App\Models\AppNotification;
use App\Models\Department;
use App\Models\Document;
use App\Models\DocumentFile;
use App\Models\DocumentRegistration;
use App\Models\DocumentRouteStep;
use App\Models\RegistryFile;
use App\Models\User;
use App\Models\WorkflowEvent;
use App\Services\AuditLogger;
use App\Services\CommentsPdfService;
use App\Services\DocumentAccessService;
use App\Services\MailRoutingService;
use App\Services\Sms\SmsSender;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

class DocumentController extends Controller
{
    public function __construct(
        private DocumentAccessService $access,
        private AuditLogger $audit,
        private SmsSender $sms,
        private MailRoutingService $routing,
        private CommentsPdfService $commentsPdf,
    ) {}

    public function inbox(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $box = $request->string('box')->toString() ?: Document::BOX_INBOX;
        if (! in_array($box, [Document::BOX_INBOX, Document::BOX_PREVIEW, Document::BOX_ARCHIVE], true)) {
            throw ValidationException::withMessages(['box' => 'Unknown mail box.']);
        }

        if ($request->boolean('queue')) {
            $box = Document::BOX_PREVIEW;
        }

        $query = Document::query()
            ->with(['registration.departmentRelation', 'currentAssignee:id,name,role', 'submitter:id,name', 'files'])
            ->whereNull('deleted_at')
            ->where('box', $box);

        if ($box === Document::BOX_INBOX) {
            $query->where('current_assignee_id', $user->id);
        } elseif ($box === Document::BOX_PREVIEW) {
            if (! $user->isRegistrar() && ! $user->isSeniorManager()) {
                return response()->json(['message' => 'Preview Box is for registry and senior managers.'], 403);
            }
            $query->where('status', '!=', Document::STATUS_DRAFT);
            if ($user->isSeniorManager() && ! $user->isRegistrar()) {
                $query->where(function ($q) use ($user) {
                    $q->where('office_id', $user->office_id)->orWhereNull('office_id');
                });
            }
        } else {
            $this->scopeVisible($query, $user, Document::BOX_ARCHIVE);
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
            $this->scopeVisible($query, $user, null);
        }

        $field = $request->string('field')->toString();
        $value = $request->string('q')->toString();

        $allowed = [
            'mail_subject_type',
            'mail_type',
            'mail_subject',
            'mail_priority',
            'volume',
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
                } elseif ($field === 'mail_subject') {
                    $q->where(function ($q2) use ($value) {
                        $q2->where('mail_subject', 'like', $value.'%')
                            ->orWhere('mail_subject_type', 'like', $value.'%');
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

        $data = $request->validate(array_merge($this->registrationRules(), [
            'comment' => ['nullable', 'string', 'max:5000'],
            'sensitivity' => ['nullable', Rule::in([Document::SENSITIVITY_NORMAL, Document::SENSITIVITY_SENSITIVE, 'bank_sensitive'])],
            'status' => ['nullable', Rule::in([Document::STATUS_DRAFT, Document::STATUS_REGISTERED, Document::STATUS_PENDING_REGISTRY])],
            'destination' => ['nullable', Rule::in([Document::BOX_INBOX, Document::BOX_ARCHIVE, Document::BOX_PREVIEW])],
            'assignee_id' => ['nullable', 'integer', 'exists:users,id'],
            'office_id' => ['nullable', 'integer', 'exists:offices,id'],
            'registry_file_id' => ['nullable', 'integer', 'exists:registry_files,id'],
            'new_file_number' => ['nullable', 'string', 'max:255'],
            'new_file_name' => ['nullable', 'string', 'max:255'],
            'new_file_office_id' => ['nullable', 'integer', 'exists:offices,id'],
            'files' => ['nullable', 'array'],
            'files.*' => ['file', 'max:51200', 'mimetypes:application/pdf,image/jpeg,image/png,image/webp'],
            'route_user_ids' => ['nullable', 'array'],
            'route_user_ids.*' => ['integer', 'exists:users,id'],
        ]));

        if ($user->role === User::ROLE_STAFF) {
            $data['department_id'] = $user->department_id;
        }

        if ($user->role === User::ROLE_STATION_SUPERVISOR) {
            $hasComment = filled($data['comment'] ?? null);
            $hasFiles = $request->hasFile('files');
            if (! $hasComment && ! $hasFiles) {
                throw ValidationException::withMessages([
                    'comment' => 'Add a comment or attach a file for this internal memo.',
                ]);
            }
            if (empty($data['mail_type'])) {
                $data['mail_type'] = 'MEMO';
            }
        }

        $deptName = null;
        $officeId = $data['office_id'] ?? $user->office_id;
        if (! empty($data['department_id'])) {
            $dept = Department::query()->find($data['department_id']);
            $deptName = $dept?->name;
            $officeId = $dept?->office_id ?: $officeId;
        }

        $destination = $data['destination'] ?? null;
        $assignee = null;
        $closedAt = null;

        if ($user->role === User::ROLE_STAFF) {
            $assignee = $this->routing->headOfDepartment($user);
            $status = Document::STATUS_IN_CIRCULATION;
            $box = Document::BOX_INBOX;
            $awaiting = false;
            $officeId = $assignee->office_id ?: $officeId;
        } elseif ($user->role === User::ROLE_STATION_SUPERVISOR) {
            $assignee = $this->routing->headOfStation($user);
            $status = Document::STATUS_IN_CIRCULATION;
            $box = Document::BOX_INBOX;
            $awaiting = false;
            $officeId = $assignee->office_id ?: $officeId;
        } elseif (! $isRegistrar) {
            $status = Document::STATUS_PENDING_REGISTRY;
            $box = Document::BOX_PREVIEW;
            $awaiting = true;
        } elseif ($destination === Document::BOX_ARCHIVE) {
            $status = Document::STATUS_CLOSED;
            $box = Document::BOX_ARCHIVE;
            $awaiting = false;
            $closedAt = now();
        } elseif ($destination === Document::BOX_INBOX) {
            if (empty($data['assignee_id'])) {
                throw ValidationException::withMessages([
                    'assignee_id' => 'Choose who receives this mail in their inbox.',
                ]);
            }
            $assignee = User::query()->where('active', true)->find($data['assignee_id']);
            if (! $assignee) {
                throw ValidationException::withMessages(['assignee_id' => 'Assignee is inactive.']);
            }
            $status = Document::STATUS_IN_CIRCULATION;
            $box = Document::BOX_INBOX;
            $awaiting = false;
            $officeId = $officeId ?: $assignee->office_id;
        } else {
            $status = $data['status'] ?? Document::STATUS_DRAFT;
            $box = Document::BOX_PREVIEW;
            $awaiting = $status === Document::STATUS_PENDING_REGISTRY;
        }

        $document = DB::transaction(function () use ($data, $user, $request, $deptName, $status, $box, $awaiting, $assignee, $closedAt, $officeId, $isRegistrar) {
            $registryFile = $this->resolveRegistryFile($data, $user, $officeId);
            if ($registryFile) {
                $data['file_number'] = $registryFile->number;
            }

            $document = Document::query()->create([
                'status' => $status,
                'box' => $box,
                'sensitivity' => $this->normalizeSensitivity($data['sensitivity'] ?? null),
                'created_by' => $user->id,
                'office_id' => $officeId,
                'registry_file_id' => $registryFile?->id,
                'submitted_by' => $isRegistrar ? null : $user->id,
                'awaiting_registry' => $awaiting,
                'current_assignee_id' => $assignee?->id,
                'closed_at' => $closedAt,
            ]);

            $reg = new DocumentRegistration(['document_id' => $document->id]);
            $this->applyRegistration($reg, $data, $deptName);
            $reg->save();

            $this->storeFiles($document, $request);

            $directAssign = in_array($user->role, [User::ROLE_STAFF, User::ROLE_STATION_SUPERVISOR], true);
            WorkflowEvent::query()->create([
                'document_id' => $document->id,
                'from_user_id' => $user->id,
                'to_user_id' => $directAssign ? $assignee?->id : null,
                'action' => $directAssign
                    ? 'assign'
                    : ($status === Document::STATUS_PENDING_REGISTRY ? 'member_submit' : 'create'),
                'payload' => [
                    'status' => $document->status,
                    'box' => $document->box,
                    'mail_type' => $data['mail_type'] ?? null,
                ],
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

            if ($assignee && ! DocumentRouteStep::query()->where('document_id', $document->id)->where('user_id', $assignee->id)->exists()) {
                $maxPos = (int) DocumentRouteStep::query()->where('document_id', $document->id)->max('position');
                DocumentRouteStep::query()->create([
                    'document_id' => $document->id,
                    'user_id' => $assignee->id,
                    'position' => $maxPos + 1,
                ]);
            }

            return $document;
        });

        $this->audit->log($user, 'document_create', 'document', (string) $document->id, 'success', null, $request);

        if ($assignee) {
            $this->notifyAssignment($user, $document, $assignee, 'assign', $request);
        }

        return response()->json($document->load([
            'registration.departmentRelation',
            'files',
            'routeSteps.user:id,name',
            'currentAssignee:id,name,role',
            'registryFile:id,number,name,status',
        ]), 201);
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
            'comments.attachments',
            'workflowEvents.fromUser:id,name',
            'workflowEvents.toUser:id,name',
            'signaturePlacements.signature',
            'signaturePlacements.user:id,name',
            'currentAssignee:id,name,role',
            'creator:id,name,role',
            'submitter:id,name,role',
            'routeSteps.user:id,name,role',
            'registryFile:id,number,name,status',
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

        $data = $request->validate(array_merge($this->registrationRules($document), [
            'sensitivity' => ['nullable', Rule::in([Document::SENSITIVITY_NORMAL, Document::SENSITIVITY_SENSITIVE, 'bank_sensitive'])],
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
        ]));

        $before = $document->registration?->toArray();

        DB::transaction(function () use ($document, $data, $user, $request, $before) {
            if (isset($data['sensitivity'])) {
                $document->sensitivity = $this->normalizeSensitivity($data['sensitivity']);
            }
            if (isset($data['status'])) {
                $document->status = $data['status'];
                $document->awaiting_registry = $data['status'] === Document::STATUS_PENDING_REGISTRY;
            }
            $document->save();

            $reg = $document->registration ?? new DocumentRegistration(['document_id' => $document->id]);
            $deptName = null;
            if (array_key_exists('department_id', $data)) {
                $deptName = $data['department_id']
                    ? Department::query()->find($data['department_id'])?->name
                    : null;
            }
            $this->applyRegistration($reg, $data, $deptName);
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

        if ($document->locked_at) {
            return response()->json(['message' => 'This mail is locked and cannot be routed.'], 422);
        }

        if ($document->status === Document::STATUS_CLOSED || $document->box === Document::BOX_ARCHIVE) {
            return response()->json(['message' => 'Archived mail cannot be routed.'], 422);
        }

        $isPush = (int) $document->current_assignee_id === (int) $user->id;
        $hierarchy = in_array($user->role, [User::ROLE_STAFF, User::ROLE_HOD, User::ROLE_HOS, User::ROLE_STATION_SUPERVISOR], true);

        if ($user->isRegistrar()) {
            $data = $request->validate([
                'assignee_id' => ['required', 'exists:users,id'],
            ]);
            $assignee = User::query()->findOrFail($data['assignee_id']);
            if (! $assignee->active) {
                return response()->json(['message' => 'Assignee is inactive.'], 422);
            }
            $action = $document->current_assignee_id ? 'push' : 'assign';
            $this->placeInInbox($document, $user, $assignee, $action);
            $this->notifyAssignment($user, $document, $assignee, $action, $request);
            $this->audit->log($user, 'document_'.$action, 'document', (string) $document->id, 'success', [
                'to' => $assignee->id,
            ], $request);

            return response()->json($document->fresh()->load(['registration', 'currentAssignee:id,name,role', 'routeSteps.user:id,name']));
        }

        if (! $isPush || ! $hierarchy) {
            return response()->json(['message' => 'Only the current holder can share this mail, or registry can assign it.'], 403);
        }

        if ($document->status === Document::STATUS_PENDING_REGISTRY || $document->awaiting_registry) {
            return response()->json(['message' => 'Only registry can distribute mail in the Preview Box.'], 403);
        }

        $next = $this->routing->nextHolder($user);
        $action = 'push';

        if ($next['box'] === Document::BOX_PREVIEW) {
            $document->forceFill([
                'current_assignee_id' => null,
                'box' => Document::BOX_PREVIEW,
                'status' => Document::STATUS_IN_CIRCULATION,
                'awaiting_registry' => true,
                'office_id' => $next['office_id'] ?: $document->office_id,
            ])->save();

            WorkflowEvent::query()->create([
                'document_id' => $document->id,
                'from_user_id' => $user->id,
                'to_user_id' => null,
                'action' => $action,
                'payload' => ['box' => Document::BOX_PREVIEW],
                'created_at' => now(),
            ]);

            $this->notifyPreview($user, $document, (int) ($next['office_id'] ?: $document->office_id), $request);
        } else {
            /** @var User $assignee */
            $assignee = $next['user'];
            $this->placeInInbox($document, $user, $assignee, $action);
            if ($next['office_id']) {
                $document->forceFill(['office_id' => $document->office_id ?: $next['office_id']])->save();
            }
            $this->notifyAssignment($user, $document, $assignee, $action, $request);
        }

        $this->audit->log($user, 'document_'.$action, 'document', (string) $document->id, 'success', [
            'box' => $document->fresh()->box,
        ], $request);

        return response()->json($document->fresh()->load(['registration', 'currentAssignee:id,name,role', 'routeSteps.user:id,name']));
    }

    public function lock(Request $request, Document $document): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->access->assertRegistrar($user);
        $document->forceFill(['locked_at' => now()])->save();
        WorkflowEvent::query()->create([
            'document_id' => $document->id,
            'from_user_id' => $user->id,
            'action' => 'lock',
            'payload' => null,
            'created_at' => now(),
        ]);

        return response()->json($document->fresh());
    }

    public function unlock(Request $request, Document $document): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->access->assertRegistrar($user);
        $document->forceFill(['locked_at' => null])->save();
        WorkflowEvent::query()->create([
            'document_id' => $document->id,
            'from_user_id' => $user->id,
            'action' => 'unlock',
            'payload' => null,
            'created_at' => now(),
        ]);

        return response()->json($document->fresh());
    }

    public function comment(Request $request, Document $document): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->access->assertCanComment($user, $document);

        $data = $request->validate([
            'body' => ['required', 'string', 'max:5000'],
            'attachment' => ['nullable', 'file', 'max:20480', 'mimetypes:application/pdf,image/jpeg,image/png,image/webp'],
        ]);

        $comment = $document->comments()->create([
            'user_id' => $user->id,
            'body' => $data['body'],
            'created_at' => now(),
        ]);

        if ($request->hasFile('attachment')) {
            $uploaded = $request->file('attachment');
            $disk = config('edms.storage_disk', 'edms');
            $path = $uploaded->store('comments/'.$document->id, $disk);
            $comment->attachments()->create([
                'original_filename' => $uploaded->getClientOriginalName(),
                'storage_path' => $path,
                'mime' => $uploaded->getMimeType() ?: 'application/octet-stream',
                'size_bytes' => $uploaded->getSize() ?: 0,
            ]);
        }

        WorkflowEvent::query()->create([
            'document_id' => $document->id,
            'from_user_id' => $user->id,
            'action' => 'comment',
            'payload' => ['comment_id' => $comment->id],
            'created_at' => now(),
        ]);

        return response()->json($comment->load(['user:id,name,role', 'attachments']), 201);
    }

    public function commentsPdf(Request $request, Document $document): Response
    {
        /** @var User $user */
        $user = $request->user();
        $this->access->assertCanViewContent($user, $document, $request);

        $binary = $this->commentsPdf->render($document);
        $name = 'comments-'.$document->id.'.pdf';

        return response($binary, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="'.$name.'"',
        ]);
    }

    public function close(Request $request, Document $document): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $isHolder = (int) $document->current_assignee_id === (int) $user->id;
        if (! $user->isRegistrar() && ! $user->isSeniorManager() && ! $isHolder) {
            return response()->json(['message' => 'Only the holder, registry, or a senior manager can move mail to the archive.'], 403);
        }

        if ($document->box === Document::BOX_ARCHIVE) {
            return response()->json(['message' => 'This mail is already in the archive.'], 422);
        }

        $document->forceFill([
            'status' => Document::STATUS_CLOSED,
            'box' => Document::BOX_ARCHIVE,
            'closed_at' => now(),
            'awaiting_registry' => false,
            'current_assignee_id' => null,
        ])->save();

        WorkflowEvent::query()->create([
            'document_id' => $document->id,
            'from_user_id' => $user->id,
            'action' => 'close',
            'payload' => ['box' => Document::BOX_ARCHIVE],
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

        if ($document->box === Document::BOX_PREVIEW && ! $document->current_assignee_id) {
            $out[] = [
                'user_id' => 0,
                'name' => 'Preview Box',
                'state' => 'current',
                'position' => 999,
            ];
        }

        if ($document->box === Document::BOX_ARCHIVE) {
            foreach ($out as &$row) {
                if ($row['state'] === 'current') {
                    $row['state'] = 'done';
                }
            }
            unset($row);
            $out[] = [
                'user_id' => 0,
                'name' => 'Archive',
                'state' => 'done',
                'position' => 1000,
            ];
        }

        return $out;
    }

    private function placeInInbox(Document $document, User $from, User $assignee, string $action): void
    {
        $document->forceFill([
            'current_assignee_id' => $assignee->id,
            'status' => Document::STATUS_IN_CIRCULATION,
            'box' => Document::BOX_INBOX,
            'awaiting_registry' => false,
            'office_id' => $document->office_id ?: $assignee->office_id,
        ])->save();

        $exists = DocumentRouteStep::query()
            ->where('document_id', $document->id)
            ->where('user_id', $assignee->id)
            ->exists();
        if (! $exists) {
            $maxPos = (int) DocumentRouteStep::query()->where('document_id', $document->id)->max('position');
            DocumentRouteStep::query()->create([
                'document_id' => $document->id,
                'user_id' => $assignee->id,
                'position' => $maxPos + 1,
            ]);
        }

        WorkflowEvent::query()->create([
            'document_id' => $document->id,
            'from_user_id' => $from->id,
            'to_user_id' => $assignee->id,
            'action' => $action,
            'payload' => ['box' => Document::BOX_INBOX],
            'created_at' => now(),
        ]);
    }

    private function notifyAssignment(User $actor, Document $document, User $assignee, string $action, Request $request): void
    {
        $ref = $document->registration?->reference_number ?: '#'.$document->id;
        AppNotification::query()->create([
            'user_id' => $assignee->id,
            'document_id' => $document->id,
            'type' => 'assignment',
            'title' => 'Mail in your inbox',
            'body' => "Mail {$ref} is in your inbox.",
        ]);

        try {
            Mail::to($assignee->email)->send(new DocumentAssignedMail($document->load('registration'), $assignee));
        } catch (\Throwable $e) {
            $this->audit->log($actor, 'assignment_mail_failed', 'document', (string) $document->id, 'denied', [
                'error' => $e->getMessage(),
                'to' => $assignee->id,
                'action' => $action,
            ], $request);
        }

        if ($assignee->phone) {
            $this->sms->send($assignee->phone, "EDMS: mail {$ref} is in your inbox.");
        }
    }

    private function notifyPreview(User $actor, Document $document, int $officeId, Request $request): void
    {
        $ref = $document->registration?->reference_number ?: '#'.$document->id;
        $managers = User::query()
            ->where('role', User::ROLE_SENIOR_MANAGER)
            ->where('active', true)
            ->where('office_id', $officeId)
            ->get();

        foreach ($managers as $manager) {
            AppNotification::query()->create([
                'user_id' => $manager->id,
                'document_id' => $document->id,
                'type' => 'assignment',
                'title' => 'Mail in Preview Box',
                'body' => "Mail {$ref} is in the Preview Box.",
            ]);
            try {
                Mail::to($manager->email)->send(new DocumentAssignedMail($document->load('registration'), $manager));
            } catch (\Throwable $e) {
                $this->audit->log($actor, 'assignment_mail_failed', 'document', (string) $document->id, 'denied', [
                    'error' => $e->getMessage(),
                    'to' => $manager->id,
                ], $request);
            }
        }
    }

    private function scopeVisible($query, User $user, ?string $box): void
    {
        if ($user->isRegistrar()) {
            return;
        }

        $query->where(function ($q) use ($user, $box) {
            $q->where('current_assignee_id', $user->id)
                ->orWhere('submitted_by', $user->id)
                ->orWhere('created_by', $user->id)
                ->orWhereHas('routeSteps', fn ($s) => $s->where('user_id', $user->id))
                ->orWhereHas('workflowEvents', function ($w) use ($user) {
                    $w->where('from_user_id', $user->id)->orWhere('to_user_id', $user->id);
                });

            if ($user->isSeniorManager() && ($box === null || $box === Document::BOX_ARCHIVE || $box === Document::BOX_PREVIEW)) {
                $q->orWhere(function ($q2) use ($user) {
                    $q2->where(function ($q3) use ($user) {
                        $q3->where('office_id', $user->office_id)->orWhereNull('office_id');
                    })->whereIn('box', [Document::BOX_PREVIEW, Document::BOX_ARCHIVE]);
                });
            }
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function resolveRegistryFile(array $data, User $user, ?int $officeId): ?RegistryFile
    {
        if (! empty($data['registry_file_id'])) {
            $file = RegistryFile::query()->find($data['registry_file_id']);
            if (! $file) {
                throw ValidationException::withMessages([
                    'registry_file_id' => 'The selected file was not found.',
                ]);
            }
            if ($file->isArchived()) {
                throw ValidationException::withMessages([
                    'registry_file_id' => 'That file is archived. Retrieve it before adding mail.',
                ]);
            }

            return $file;
        }

        $number = trim((string) ($data['new_file_number'] ?? $data['file_number'] ?? ''));
        $name = trim((string) ($data['new_file_name'] ?? ''));
        if ($number === '' && $name === '') {
            return null;
        }

        if ($number === '' || $name === '') {
            throw ValidationException::withMessages([
                'new_file_number' => 'Open a new file with both a file number and a file name.',
            ]);
        }

        $existing = RegistryFile::query()->where('number', $number)->first();
        if ($existing) {
            if ($existing->isArchived()) {
                throw ValidationException::withMessages([
                    'new_file_number' => 'A file with this number is archived. Retrieve it or choose another number.',
                ]);
            }

            return $existing;
        }

        $fileOfficeId = ! empty($data['new_file_office_id'])
            ? (int) $data['new_file_office_id']
            : ($officeId ?: $user->office_id);

        if (! $fileOfficeId) {
            throw ValidationException::withMessages([
                'new_file_office_id' => 'Choose the region for this file.',
            ]);
        }

        return RegistryFile::query()->create([
            'number' => $number,
            'name' => $name,
            'status' => RegistryFile::STATUS_OPEN,
            'office_id' => $fileOfficeId,
            'created_by' => $user->id,
        ]);
    }

    /** @return array<string, mixed> */
    private function registrationRules(?Document $document = null): array
    {
        $uniqueRef = Rule::unique('document_registrations', 'reference_number');
        if ($document?->registration) {
            $uniqueRef = $uniqueRef->ignore($document->registration->id);
        }

        return [
            'mail_subject_type' => ['nullable', 'string', 'max:255'],
            'mail_type' => ['nullable', 'string', 'max:255'],
            'mail_subject' => ['nullable', 'string', 'max:255'],
            'reference_number' => ['nullable', 'string', 'max:255', $uniqueRef],
            'file_number' => ['nullable', 'string', 'max:255'],
            'folio_number' => ['nullable', 'string', 'max:255'],
            'sender_or_origin' => ['nullable', 'string', 'max:255'],
            'received_date' => ['nullable', 'date'],
            'classification' => ['nullable', 'string', 'max:255'],
            'mail_priority' => ['nullable', Rule::in(['normal', 'urgent', 'very_urgent'])],
            'volume' => ['nullable', 'string', 'max:255'],
            'department_id' => ['nullable', 'exists:departments,id'],
        ];
    }

    private function applyRegistration(DocumentRegistration $reg, array $data, ?string $deptName = null): void
    {
        foreach ([
            'mail_type', 'mail_subject', 'mail_subject_type', 'reference_number', 'file_number', 'folio_number',
            'sender_or_origin', 'received_date', 'classification', 'mail_priority', 'volume', 'department_id',
        ] as $field) {
            if (array_key_exists($field, $data)) {
                $reg->{$field} = $data[$field];
            }
        }

        if ($reg->mail_subject === null && $reg->mail_subject_type) {
            $reg->mail_subject = $reg->mail_subject_type;
        }

        $combined = trim(implode(' — ', array_filter([$reg->mail_type, $reg->mail_subject])));
        if ($combined !== '') {
            $reg->mail_subject_type = $combined;
        }

        if (! $reg->mail_priority) {
            $reg->mail_priority = 'normal';
        }

        if ($deptName !== null || array_key_exists('department_id', $data)) {
            $reg->department = $deptName;
        }
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

    private function normalizeSensitivity(?string $sensitivity): string
    {
        if ($sensitivity === 'bank_sensitive' || $sensitivity === Document::SENSITIVITY_SENSITIVE) {
            return Document::SENSITIVITY_SENSITIVE;
        }

        return Document::SENSITIVITY_NORMAL;
    }
}
