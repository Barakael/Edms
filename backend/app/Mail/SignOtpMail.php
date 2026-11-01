<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class SignOtpMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public User $user,
        public string $code,
        public int $ttlSeconds,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'rDMS-HQ signature verification code',
        );
    }

    public function content(): Content
    {
        $mins = max(1, (int) ceil($this->ttlSeconds / 60));

        return new Content(
            htmlString: '<p>Hello '.e($this->user->name).',</p>'
                .'<p>Your rDMS-HQ signature verification code is:</p>'
                .'<p style="font-size:24px;letter-spacing:4px;"><strong>'.e($this->code).'</strong></p>'
                .'<p>This code expires in about '.$mins.' minute(s). Do not share it.</p>',
        );
    }
}
