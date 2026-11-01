<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\Document;
use App\Models\RegistryFile;
use App\Models\User;
use App\Models\WorkflowEvent;
use App\Services\DocumentAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class RegistryFileController extends Controller
{
    public function __construct(private DocumentAccessService $access) {}

    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $query = RegistryFile::query()
            ->with(['office:id,name', 'department:id,name,office_id', 'creator:id,name'])
            ->withCount('documents')
            ->orderBy('number');

        $this->scopeFiles($query, $user, $request);

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }

        if ($request->filled('q')) {
            $q = '%'.$request->string('q').'%';
            $query->where(function ($inner) use ($q) {
                $inner->where('number', 'like', $q)->orWhere('name', 'like', $q);
            });
        }

        if ($request->filled('office_id') && $user->seesAllDepartments()) {
            $query->where('office_id', $request->integer('office_id'));
        }

        if ($request->filled('department_id') && $user->seesAllDepartments()) {
            $query->where('department_id', $request->integer('department_id'));
        }

        return response()->json(['files' => $query->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->access->assertRegistrarOrHod($user);

        $data = $request->validate([
            'number' => ['required', 'string', 'max:255', 'unique:registry_files,number'],
            'name' => ['required', 'string', 'max:255'],
            'office_id' => ['nullable', 'integer', 'exists:offices,id'],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        [$departmentId, $officeId] = $this->resolveOwnership($user, $data);

        $file = RegistryFile::query()->create([
            'number' => trim($data['number']),
            'name' => trim($data['name']),
            'status' => RegistryFile::STATUS_OPEN,
            'office_id' => $officeId,
            'department_id' => $departmentId,
            'created_by' => $user->id,
            'notes' => $data['notes'] ?? null,
        ]);

        return response()->json(
            $file->load(['office:id,name', 'department:id,name', 'creator:id,name'])->loadCount('documents'),
            201
        );
    }

    public function show(Request $request, RegistryFile $registryFile): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->assertCanSeeFile($user, $registryFile);

        $registryFile->load(['office:id,name', 'department:id,name', 'creator:id,name']);
        $registryFile->loadCount('documents');

        $documents = $registryFile->documents()
            ->with([
                'registration.departmentRelation:id,name',
                'currentAssignee:id,name,role',
                'creator:id,name',
            ])
            ->orderByDesc('id')
            ->get();

        return response()->json([
            'file' => $registryFile,
            'documents' => $documents,
        ]);
    }

    public function update(Request $request, RegistryFile $registryFile): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->assertCanMutateFile($user, $registryFile);

        $data = $request->validate([
            'number' => [
                'sometimes',
                'string',
                'max:255',
                Rule::unique('registry_files', 'number')->ignore($registryFile->id),
            ],
            'name' => ['sometimes', 'string', 'max:255'],
            'office_id' => ['sometimes', 'nullable', 'integer', 'exists:offices,id'],
            'department_id' => ['sometimes', 'nullable', 'integer', 'exists:departments,id'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        if ($user->role === User::ROLE_HOD) {
            unset($data['department_id'], $data['office_id']);
        } elseif (array_key_exists('department_id', $data) || array_key_exists('office_id', $data)) {
            [$departmentId, $officeId] = $this->resolveOwnership($user, array_merge([
                'department_id' => $data['department_id'] ?? $registryFile->department_id,
                'office_id' => $data['office_id'] ?? $registryFile->office_id,
            ], $data));
            $data['department_id'] = $departmentId;
            $data['office_id'] = $officeId;
        }

        if (array_key_exists('number', $data)) {
            $data['number'] = trim($data['number']);
        }
        if (array_key_exists('name', $data)) {
            $data['name'] = trim($data['name']);
        }

        $registryFile->fill($data)->save();

        if (array_key_exists('number', $data)) {
            foreach ($registryFile->documents as $document) {
                $document->registration?->forceFill(['file_number' => $registryFile->number])->save();
            }
        }

        return response()->json(
            $registryFile->fresh()->load(['office:id,name', 'department:id,name', 'creator:id,name'])->loadCount('documents')
        );
    }

    public function destroy(Request $request, RegistryFile $registryFile): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->assertCanMutateFile($user, $registryFile);

        $count = $registryFile->documents()->count();
        if ($count > 0) {
            throw ValidationException::withMessages([
                'file' => "This file still has {$count} document(s). Move or clear them before deleting the file.",
            ]);
        }

        $registryFile->delete();

        return response()->json(['ok' => true]);
    }

    public function archive(Request $request, RegistryFile $registryFile): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->assertCanMutateFile($user, $registryFile);

        if ($registryFile->isArchived()) {
            throw ValidationException::withMessages([
                'file' => 'This file is already archived.',
            ]);
        }

        DB::transaction(function () use ($registryFile, $user) {
            $registryFile->forceFill([
                'status' => RegistryFile::STATUS_ARCHIVED,
                'closed_at' => now(),
                'retrieved_at' => null,
            ])->save();

            $openDocs = $registryFile->documents()
                ->where('box', '!=', Document::BOX_ARCHIVE)
                ->get();

            foreach ($openDocs as $document) {
                $document->forceFill([
                    'status' => Document::STATUS_CLOSED,
                    'box' => Document::BOX_ARCHIVE,
                    'current_assignee_id' => null,
                    'awaiting_registry' => false,
                    'closed_at' => now(),
                ])->save();

                WorkflowEvent::query()->create([
                    'document_id' => $document->id,
                    'from_user_id' => $user->id,
                    'action' => 'close',
                    'payload' => [
                        'box' => Document::BOX_ARCHIVE,
                        'via' => 'registry_file_archive',
                        'registry_file_id' => $document->registry_file_id,
                    ],
                    'created_at' => now(),
                ]);
            }
        });

        return response()->json([
            'file' => $registryFile->fresh()->load(['office:id,name', 'department:id,name', 'creator:id,name'])->loadCount('documents'),
            'documents' => $registryFile->documents()
                ->with(['registration', 'currentAssignee:id,name,role'])
                ->orderByDesc('id')
                ->get(),
        ]);
    }

    public function retrieve(Request $request, RegistryFile $registryFile): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->assertCanMutateFile($user, $registryFile);

        if (! $registryFile->isArchived()) {
            throw ValidationException::withMessages([
                'file' => 'Only an archived file can be retrieved.',
            ]);
        }

        $registryFile->forceFill([
            'status' => RegistryFile::STATUS_OPEN,
            'retrieved_at' => now(),
            'closed_at' => null,
        ])->save();

        foreach ($registryFile->documents as $document) {
            WorkflowEvent::query()->create([
                'document_id' => $document->id,
                'from_user_id' => $user->id,
                'action' => 'retrieve',
                'payload' => [
                    'via' => 'registry_file_retrieve',
                    'registry_file_id' => $registryFile->id,
                ],
                'created_at' => now(),
            ]);
        }

        return response()->json([
            'file' => $registryFile->fresh()->load(['office:id,name', 'department:id,name', 'creator:id,name'])->loadCount('documents'),
            'documents' => $registryFile->documents()
                ->with(['registration', 'currentAssignee:id,name,role'])
                ->orderByDesc('id')
                ->get(),
        ]);
    }

    private function scopeFiles($query, User $user, Request $request): void
    {
        if ($user->seesAllDepartments()) {
            return;
        }

        if (! $user->department_id) {
            $query->whereRaw('1 = 0');

            return;
        }

        $query->where('department_id', $user->department_id);
    }

    private function assertCanSeeFile(User $user, RegistryFile $file): void
    {
        if ($user->seesAllDepartments()) {
            return;
        }

        if ($user->department_id && (int) $file->department_id === (int) $user->department_id) {
            return;
        }

        throw new AccessDeniedHttpException('You can only view files from your department.');
    }

    private function assertCanMutateFile(User $user, RegistryFile $file): void
    {
        if ($user->isRegistrar()) {
            return;
        }

        if ($user->role === User::ROLE_HOD
            && $user->department_id
            && (int) $file->department_id === (int) $user->department_id) {
            return;
        }

        throw new AccessDeniedHttpException('You cannot change this file.');
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{0: int, 1: int}
     */
    private function resolveOwnership(User $user, array $data): array
    {
        if ($user->role === User::ROLE_HOD) {
            if (! $user->department_id) {
                throw ValidationException::withMessages([
                    'department_id' => 'Your account is not linked to a department.',
                ]);
            }
            $dept = Department::query()->findOrFail($user->department_id);

            return [(int) $dept->id, (int) $dept->office_id];
        }

        $departmentId = $data['department_id'] ?? null;
        if (! $departmentId) {
            throw ValidationException::withMessages([
                'department_id' => 'Choose the department this file belongs to.',
            ]);
        }

        $dept = Department::query()->findOrFail($departmentId);
        $officeId = ! empty($data['office_id']) ? (int) $data['office_id'] : (int) $dept->office_id;
        if ((int) $dept->office_id !== $officeId) {
            throw ValidationException::withMessages([
                'department_id' => 'Department does not belong to the selected region.',
            ]);
        }

        return [(int) $dept->id, $officeId];
    }
}
