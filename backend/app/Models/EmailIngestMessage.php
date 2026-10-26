<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasOne;

class EmailIngestMessage extends Model
{
    protected $fillable = [
        'message_id',
        'from_address',
        'subject',
        'received_at',
        'status',
        'raw_refs',
        'failure_reason',
    ];

    protected function casts(): array
    {
        return [
            'received_at' => 'datetime',
        ];
    }

    public function draft(): HasOne
    {
        return $this->hasOne(EmailDraft::class);
    }
}
