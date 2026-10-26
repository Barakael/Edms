<?php

namespace App\Services;

use App\Models\Document;
use App\Models\User;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class DocumentAccessService
{
    public function __construct(private AuditLogger $audit) {}

    public function canViewContent(User $user, Document $document): bool
    {
        if (! $user->active) {
            return false;
        }

        if ($user->isRegistrar()) {
            return true;
        }

        if ((int) $document->current_assignee_id === (int) $user->id) {
            return true;
        }

        // Submitter may view their own pending_registry items
        if (
            $document->status === Document::STATUS_PENDING_REGISTRY
            && (int) $document->submitted_by === (int) $user->id
        ) {
            return true;
        }

        return false;
    }

    public function assertCanViewContent(User $user, Document $document, ?Request $request = null): void
    {
        if ($this->canViewContent($user, $document)) {
            if ($document->sensitivity === Document::SENSITIVITY_BANK) {
                $this->assertStepUp($user, $document, $request);
            }

            return;
        }

        $this->audit->log($user, 'acl_deny', 'document', (string) $document->id, 'denied', [
            'reason' => 'not_assignee',
        ], $request);

        throw new AccessDeniedHttpException('You are not allowed to view this document.');
    }

    /**
     * Registry/admin may always download. Assignees only when this document
     * has assignee_can_download enabled by registry.
     */
    public function canDownload(User $user, Document $document): bool
    {
        if (! $this->canViewContent($user, $document)) {
            return false;
        }

        if ($user->isRegistrar()) {
            return true;
        }

        return (bool) $document->assignee_can_download
            && (int) $document->current_assignee_id === (int) $user->id;
    }

    public function assertCanDownload(User $user, Document $document, ?Request $request = null): void
    {
        if ($this->canDownload($user, $document)) {
            return;
        }

        $this->audit->log($user, 'file_download_denied', 'document', (string) $document->id, 'denied', [
            'reason' => 'no_document_download_grant',
        ], $request);

        throw new AccessDeniedHttpException(
            'Download is only available to registry, or to the assignee when registry grants it on this document.'
        );
    }

    public function assertRegistrar(User $user): void
    {
        if (! $user->isRegistrar()) {
            throw new AccessDeniedHttpException('Registrar role required.');
        }
    }

    public function assertCanActOnWorkflow(User $user, Document $document): void
    {
        if ((int) $document->current_assignee_id !== (int) $user->id) {
            $this->audit->log($user, 'acl_deny', 'document', (string) $document->id, 'denied', [
                'reason' => 'workflow_not_assignee',
            ]);
            throw new AccessDeniedHttpException('Only the current assignee can perform this action.');
        }
    }

    public function assertCanComment(User $user, Document $document): void
    {
        if ($user->isRegistrar()) {
            return;
        }

        if ((int) $document->current_assignee_id === (int) $user->id) {
            return;
        }

        if (
            $document->status === Document::STATUS_PENDING_REGISTRY
            && (int) $document->submitted_by === (int) $user->id
        ) {
            return;
        }

        throw new AccessDeniedHttpException('You cannot comment on this document.');
    }

    public function assertStepUp(User $user, Document $document, ?Request $request = null): void
    {
        $verifiedAt = $user->step_up_verified_at;
        $windowMinutes = (int) config('edms.step_up_minutes', 15);

        if ($verifiedAt && $verifiedAt->greaterThan(now()->subMinutes($windowMinutes))) {
            $this->audit->log($user, 'bank_doc_open', 'document', (string) $document->id, 'success', null, $request);

            return;
        }

        $this->audit->log($user, 'bank_doc_open', 'document', (string) $document->id, 'denied', [
            'reason' => 'step_up_required',
        ], $request);

        throw new AccessDeniedHttpException('Step-up verification required for bank-sensitive documents.');
    }
}
