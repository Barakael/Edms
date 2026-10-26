<?php

namespace App\Mail;

use App\Models\Document;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class DocumentAssignedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public Document $document,
        public User $assignee,
    ) {}

    public function envelope(): Envelope
    {
        $ref = $this->document->registration?->reference_number ?: '#'.$this->document->id;

        return new Envelope(
            subject: 'EDMS: Document assigned — '.$ref,
        );
    }

    public function content(): Content
    {
        $base = rtrim((string) config('edms.app_url', config('app.url')), '/');

        return new Content(
            htmlString: '<p>Hello '.e($this->assignee->name).',</p>'
                .'<p>A document has been assigned to you in EDMS.</p>'
                .'<p><strong>Reference:</strong> '
                .e($this->document->registration?->reference_number ?: 'Doc #'.$this->document->id)
                .'</p>'
                .'<p><a href="'.e($base.'/documents/'.$this->document->id).'">Open document</a></p>'
                .'<p>Please review and take action.</p>',
        );
    }
}
