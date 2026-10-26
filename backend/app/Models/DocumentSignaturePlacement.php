<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DocumentSignaturePlacement extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'document_id',
        'document_file_id',
        'user_id',
        'signature_id',
        'page',
        'x_pct',
        'y_pct',
        'placed_at',
    ];

    protected function casts(): array
    {
        return [
            'placed_at' => 'datetime',
            'x_pct' => 'float',
            'y_pct' => 'float',
        ];
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(Document::class);
    }

    public function file(): BelongsTo
    {
        return $this->belongsTo(DocumentFile::class, 'document_file_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function signature(): BelongsTo
    {
        return $this->belongsTo(Signature::class);
    }
}
