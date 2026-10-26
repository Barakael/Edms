<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DocumentFile extends Model
{
    protected $fillable = [
        'document_id',
        'sort_order',
        'original_filename',
        'storage_path',
        'mime',
        'page_count',
        'checksum',
        'size_bytes',
    ];

    public function document(): BelongsTo
    {
        return $this->belongsTo(Document::class);
    }

    public function signaturePlacements(): HasMany
    {
        return $this->hasMany(DocumentSignaturePlacement::class);
    }
}
