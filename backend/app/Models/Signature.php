<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Signature extends Model
{
    protected $fillable = [
        'user_id',
        'ink_data',
        'capture_source',
        'device_metadata',
        'revoked_at',
    ];

    protected function casts(): array
    {
        return [
            'device_metadata' => 'array',
            'revoked_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
