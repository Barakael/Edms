<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RegistryFile extends Model
{
    public const STATUS_OPEN = 'open';

    public const STATUS_ARCHIVED = 'archived';

    protected $fillable = [
        'number',
        'name',
        'status',
        'office_id',
        'created_by',
        'notes',
        'closed_at',
        'retrieved_at',
    ];

    protected function casts(): array
    {
        return [
            'closed_at' => 'datetime',
            'retrieved_at' => 'datetime',
        ];
    }

    public function office(): BelongsTo
    {
        return $this->belongsTo(Office::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function documents(): HasMany
    {
        return $this->hasMany(Document::class, 'registry_file_id');
    }

    public function isArchived(): bool
    {
        return $this->status === self::STATUS_ARCHIVED;
    }
}
