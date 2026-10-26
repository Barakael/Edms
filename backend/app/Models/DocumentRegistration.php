<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DocumentRegistration extends Model
{
    protected $fillable = [
        'document_id',
        'mail_subject_type',
        'reference_number',
        'file_number',
        'folio_number',
        'sender_or_origin',
        'received_date',
        'classification',
        'department',
        'department_id',
    ];

    protected function casts(): array
    {
        return [
            'received_date' => 'date',
        ];
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(Document::class);
    }

    public function departmentRelation(): BelongsTo
    {
        return $this->belongsTo(Department::class, 'department_id');
    }
}
