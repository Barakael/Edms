<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: DejaVu Sans, sans-serif; font-size: 12px; color: #1c1917; line-height: 1.5; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        .meta { color: #44403c; margin: 0 0 22px; }
        .comment { margin: 0 0 20px; padding: 0 0 14px; border-bottom: 1px solid #d6d3d1; page-break-inside: avoid; }
        .who { font-weight: bold; font-size: 13px; }
        .when { color: #57534e; font-size: 11px; margin: 2px 0 8px; }
        .body { white-space: pre-wrap; margin: 0; }
        .attach { margin-top: 8px; font-style: italic; color: #44403c; }
    </style>
</head>
<body>
    <h1>Comments</h1>
    <p class="meta">
        {{ $reference }}<br>
        {{ $subject }}
    </p>
    @forelse ($comments as $comment)
        <div class="comment">
            <div class="who">{{ $comment->user?->name ?? 'User' }}</div>
            <div class="when">{{ optional($comment->created_at)->format('d/m/Y H:i') }}</div>
            <p class="body">{{ $comment->body }}</p>
            @foreach ($comment->attachments as $attachment)
                <div class="attach">Attachment: {{ $attachment->original_filename }} (continues on the following pages)</div>
            @endforeach
        </div>
    @empty
        <p>No comments have been recorded on this document.</p>
    @endforelse
</body>
</html>
