# rDMS-HQ — Records & Document Management System

React + TypeScript frontend, Laravel API (PHP **≥ 8.4.27** / **≥ 8.5.12** patched builds), MySQL.

Brand palette: light blue / gray / darkish blue (`frontend/src/styles/tokens.css`).

## Quick start (local)

### Backend

```bash
cd backend
cp .env.example .env   # if needed
composer install
php artisan key:generate
php artisan jwt:secret
php artisan migrate --seed
mkdir -p storage/app/edms
php artisan serve
```

Default DB is SQLite for local speed. For MySQL, set `DB_CONNECTION=mysql` and matching credentials (see `docker-compose.yml`).

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 (proxies `/api` → `:8000`).

### Demo users (password: `password`)

| Email | Role |
| --- | --- |
| it@tazama.co.tz | System admin |
| registrar@edms.local | Registry |
| officer@edms.local | Staff |
| officer2@edms.local | Staff |
| director@edms.local | Senior manager |
| member@edms.local | Staff |
| hod@edms.local | Head of department |

See also [`docs/mail-ingest.md`](docs/mail-ingest.md) for inbound mail behaviour and gaps.

### Feature uplift highlights

- Fixed in-app PDF/image preview; single diagonal reader watermark
- Managed departments per office; registry user admin (name/email/phone)
- Member submit → registry queue → distribute; assignment email + SMS scaffold + bell
- Download button gated by registry grant + request flow
- Signature OTP (~2 min) via email (SMS stub); pipeline dots; mobile drag-to-sign

### Email ingest demo

```bash
cd backend && php artisan edms:poll-email --demo
```

Or `POST /api/email/ingest` with header `X-EDMS-Ingest-Secret` when configured.

## PHP security note

Deploy only patched PHP (**≥ 8.4.27** or **≥ 8.5.12**). The API Dockerfile pins `php:8.4.27-cli-bookworm`. Local Homebrew PHP may lag; treat production images as the source of truth.

## Features covered

- JWT auth, refresh rotation, session revoke, step-up for sensitive docs
- Registrar enrollment, multi-file bundles, soft-delete / metadata update
- Assignee-only inbox & content ACL, assign/push, comments, append-only history + audit logs
- In-app preview (no download), 4-corner reader watermark
- Signature capture: USB pad / iPhone / mouse-trackpad behind `SignatureCaptureSource`
- Per-field search, email → registrar drafts
