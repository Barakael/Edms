<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;

class AuditLogger
{
    public function log(
        ?User $actor,
        string $action,
        ?string $resourceType = null,
        ?string $resourceId = null,
        string $outcome = 'success',
        ?array $meta = null,
        ?Request $request = null,
    ): void {
        $request ??= request();

        AuditLog::query()->create([
            'actor_id' => $actor?->id,
            'action' => $action,
            'resource_type' => $resourceType,
            'resource_id' => $resourceId !== null ? (string) $resourceId : null,
            'ip' => $request?->ip(),
            'user_agent' => $request?->userAgent(),
            'outcome' => $outcome,
            'meta' => $meta,
        ]);
    }
}
