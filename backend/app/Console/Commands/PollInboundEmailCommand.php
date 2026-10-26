<?php

namespace App\Console\Commands;

use App\Services\EmailIngestService;
use Illuminate\Console\Command;

class PollInboundEmailCommand extends Command
{
    protected $signature = 'edms:poll-email {--demo : Ingest a demo message for local testing}';

    protected $description = 'Poll info@ mailbox (or ingest a demo message) into registrar drafts';

    public function handle(EmailIngestService $ingest): int
    {
        if ($this->option('demo')) {
            $draft = $ingest->ingest([
                'message_id' => 'demo-'.now()->timestamp,
                'from' => 'sender@example.com',
                'subject' => 'Tender submission package',
                'received_at' => now()->toIso8601String(),
                'attachments' => [
                    [
                        'filename' => 'cover-note.txt.pdf',
                        'mime' => 'application/pdf',
                        'contents' => base64_encode('%PDF-1.4 demo content for EDMS ingest'),
                    ],
                ],
            ]);
            $this->info('Demo draft created #'.$draft->id.' document #'.$draft->document_id);

            return self::SUCCESS;
        }

        $this->warn('Configure IMAP credentials and implement mailbox polling, or POST to /api/email/ingest.');

        return self::SUCCESS;
    }
}
