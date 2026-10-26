<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Document extends Model
{
    use SoftDeletes;

    public const STATUS_DRAFT = 'draft';

    public const STATUS_PENDING_REGISTRY = 'pending_registry';

    public const STATUS_REGISTERED = 'registered';

    public const STATUS_IN_CIRCULATION = 'in_circulation';

    public const STATUS_CLOSED = 'closed';

    public const SENSITIVITY_NORMAL = 'normal';

    public const SENSITIVITY_BANK = 'bank_sensitive';

    protected $fillable = [
        'status',
        'sensitivity',
        'created_by',
        'submitted_by',
        'awaiting_registry',
        'current_assignee_id',
        'assignee_can_download',
        'closed_at',
    ];

    protected function casts(): array
    {
        return [
            'closed_at' => 'datetime',
            'awaiting_registry' => 'boolean',
            'assignee_can_download' => 'boolean',
        ];
    }

    public function registration(): HasOne
    {
        return $this->hasOne(DocumentRegistration::class);
    }

    public function files(): HasMany
    {
        return $this->hasMany(DocumentFile::class)->orderBy('sort_order');
    }

    public function comments(): HasMany
    {
        return $this->hasMany(Comment::class)->orderBy('created_at');
    }

    public function workflowEvents(): HasMany
    {
        return $this->hasMany(WorkflowEvent::class)->orderBy('created_at');
    }

    public function signaturePlacements(): HasMany
    {
        return $this->hasMany(DocumentSignaturePlacement::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function currentAssignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'current_assignee_id');
    }

    public function routeSteps(): HasMany
    {
        return $this->hasMany(DocumentRouteStep::class)->orderBy('position');
    }
}
