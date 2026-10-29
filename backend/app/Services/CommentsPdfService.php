<?php

namespace App\Services;

use App\Models\CommentAttachment;
use App\Models\Document;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Facades\Storage;
use setasign\Fpdi\Fpdi;

class CommentsPdfService
{
    public function render(Document $document): string
    {
        $document->loadMissing(['registration', 'comments.user', 'comments.attachments']);

        $reference = $document->registration?->reference_number
            ?: $document->registration?->file_number
            ?: 'Document #'.$document->id;
        $subject = $document->registration?->mail_subject
            ?: $document->registration?->mail_subject_type
            ?: 'Mail';

        $htmlPdf = Pdf::loadView('comments.pdf', [
            'reference' => $reference,
            'subject' => $subject,
            'comments' => $document->comments,
        ])->output();

        $base = tempnam(sys_get_temp_dir(), 'edms-comments-');
        if ($base === false) {
            return $htmlPdf;
        }
        $commentPath = $base.'.pdf';
        file_put_contents($commentPath, $htmlPdf);
        @unlink($base);

        $disk = config('edms.storage_disk', 'edms');
        $pdf = new Fpdi;
        $this->importPdf($pdf, $commentPath);

        foreach ($document->comments as $comment) {
            foreach ($comment->attachments as $attachment) {
                $path = Storage::disk($disk)->path($attachment->storage_path);
                if (! is_file($path)) {
                    $this->notePage($pdf, $attachment->original_filename, 'File is missing from storage.');
                    continue;
                }
                $this->appendAttachment($pdf, $attachment, $path);
            }
        }

        $binary = $pdf->Output('S');
        @unlink($commentPath);

        return $binary;
    }

    private function importPdf(Fpdi $pdf, string $path): void
    {
        $pageCount = $pdf->setSourceFile($path);
        for ($i = 1; $i <= $pageCount; $i++) {
            $tpl = $pdf->importPage($i);
            $size = $pdf->getTemplateSize($tpl);
            $pdf->AddPage($size['orientation'], [$size['width'], $size['height']]);
            $pdf->useTemplate($tpl);
        }
    }

    private function appendAttachment(Fpdi $pdf, CommentAttachment $attachment, string $path): void
    {
        $mime = strtolower($attachment->mime);
        if (str_starts_with($mime, 'image/') && $mime !== 'image/webp') {
            $pdf->AddPage();
            $pdf->SetFont('Helvetica', '', 11);
            $pdf->Cell(0, 8, 'Attachment: '.$attachment->original_filename, 0, 1);
            try {
                $pdf->Image($path, 15, 28, 180);
            } catch (\Throwable) {
                $this->notePage($pdf, $attachment->original_filename, 'Image could not be embedded.');
            }

            return;
        }

        if ($mime === 'application/pdf' || str_ends_with(strtolower($attachment->original_filename), '.pdf')) {
            try {
                $this->importPdf($pdf, $path);

                return;
            } catch (\Throwable) {
                $this->notePage($pdf, $attachment->original_filename, 'This PDF uses a format that could not be merged. Open it from the document.');
            }

            return;
        }

        $this->notePage($pdf, $attachment->original_filename, 'This file type is stored on the document and is not embedded here.');
    }

    private function notePage(Fpdi $pdf, string $filename, string $reason): void
    {
        $pdf->AddPage();
        $pdf->SetFont('Helvetica', 'B', 12);
        $pdf->Cell(0, 10, 'Attachment: '.$filename, 0, 1);
        $pdf->SetFont('Helvetica', '', 11);
        $pdf->MultiCell(0, 7, $reason);
    }
}
