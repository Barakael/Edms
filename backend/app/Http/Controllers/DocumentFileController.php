<?php

namespace App\Http\Controllers;

use App\Models\DocumentFile;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\DocumentAccessService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DocumentFileController extends Controller
{
    public function __construct(
        private DocumentAccessService $access,
        private AuditLogger $audit,
    ) {}

    public function stream(Request $request, DocumentFile $file): StreamedResponse
    {
        /** @var User $user */
        $user = $request->user();
        $document = $file->document;
        $this->access->assertCanViewContent($user, $document, $request);

        $disk = Storage::disk(config('edms.storage_disk', 'edms'));
        if (! $disk->exists($file->storage_path)) {
            abort(404, 'File missing.');
        }

        $this->audit->log($user, 'file_stream', 'document_file', (string) $file->id, 'success', [
            'document_id' => $document->id,
        ], $request);

        return response()->stream(function () use ($disk, $file) {
            $stream = $disk->readStream($file->storage_path);
            fpassthru($stream);
            if (is_resource($stream)) {
                fclose($stream);
            }
        }, 200, [
            'Content-Type' => $file->mime,
            'Content-Disposition' => 'inline; filename="preview"',
            'Cache-Control' => 'no-store, private',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function download(Request $request, DocumentFile $file): StreamedResponse
    {
        /** @var User $user */
        $user = $request->user();
        $document = $file->document;
        $this->access->assertCanViewContent($user, $document, $request);
        $this->access->assertCanDownload($user, $document, $request);

        $disk = Storage::disk(config('edms.storage_disk', 'edms'));
        if (! $disk->exists($file->storage_path)) {
            abort(404, 'File missing.');
        }

        $this->audit->log($user, 'file_download', 'document_file', (string) $file->id, 'success', [
            'document_id' => $document->id,
        ], $request);

        $name = $file->original_filename ?: 'document';

        return response()->stream(function () use ($disk, $file) {
            $stream = $disk->readStream($file->storage_path);
            fpassthru($stream);
            if (is_resource($stream)) {
                fclose($stream);
            }
        }, 200, [
            'Content-Type' => $file->mime,
            'Content-Disposition' => 'attachment; filename="'.addslashes($name).'"',
            'Cache-Control' => 'no-store, private',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
