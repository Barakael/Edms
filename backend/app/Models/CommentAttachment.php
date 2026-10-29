<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CommentAttachment extends Model
{
    protected $fillable = [
        'comment_id',
        'original_filename',
        'storage_path',
        'mime',
        'size_bytes',
    ];

    public function comment(): BelongsTo
    {
        return $this->belongsTo(Comment::class);
    }
}
