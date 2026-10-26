# Mail ingest — how it works and gaps

## How it works today

1. **Inbound webhook** — `POST /api/email/ingest` accepts a JSON payload (`message_id`, `from`, `subject`, `received_at`, `attachments[]` with base64/raw contents). Optional header `X-EDMS-Ingest-Secret` must match `EDMS_EMAIL_INGEST_SECRET` when that env var is set.

2. **Demo command** — `php artisan edms:poll-email --demo` synthesizes one message and calls the same ingest service (useful for local QA).

3. **Processing** ([`EmailIngestService`](../backend/app/Services/EmailIngestService.php)):
   - Deduplicates on `message_id`.
   - Creates `email_ingest_messages` row.
   - Creates a **draft** `documents` row owned by the first active registrar (or first user), with a stub `document_registrations` (`mail_subject_type=inbound_email`).
   - Stores PDF/image attachments on the private `edms` disk as `document_files`.
   - Creates `email_drafts` (`status=pending`) for the registrar **Email drafts** UI.
   - Writes a `workflow_events` row (`email_ingest`) and an audit log entry.

4. **Registrar claim** — `POST /api/email-drafts/{id}/claim` marks the draft claimed; the linked document is then completed/assigned through normal registration flows.

This path is **inbound mail → draft document**, not outbound “mail about a registered document,” and not IMAP polling of `info@…` by itself.

## Gaps

- No real **IMAP/POP/idle** poller against `info@…` (the artisan command without `--demo` only prints a warning).
- Not connected to **assignment notification email** (separate outbound mail feature).
- Demo attachment may be a **minimal/invalid PDF**, which previously compounded blank in-app preview issues.
- Claim does **not** auto-fill registration fields (reference, folio, department, etc.).
- No virus scan, attachment size quotas, or rich handling of non-PDF/image types (unsupported mimes are skipped).
- No link from a registered document back to the original email message beyond ingest metadata.

## Related env

- `EDMS_EMAIL_INGEST_SECRET` — webhook auth
- `EDMS_EMAIL_MAILBOX` — documented mailbox address (informational until IMAP exists)
- `MAIL_*` / `EDMS_APP_URL` — used for outbound assignment/OTP mail (not ingest)
