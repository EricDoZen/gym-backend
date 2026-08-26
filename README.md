# Gym Backend (TiDB)

REST API for Elite Myanmar gym management.

## Setup

1. Copy env file and set `DATABASE_URL` from TiDB Cloud console:

```bash
cp .env.example .env
```

TiDB Cloud Serverless uses the HTTP driver (`@tidbcloud/serverless`), not raw `mysql2` on port 4000. The standard MySQL TLS handshake can hang on some Node/Windows setups; the serverless driver avoids that.

2. Install, check connection, migrate, and seed:

```bash
npm install
npm run setup
```

Or step by step:

```bash
npm run db:check
npm run db:migrate
npm run db:seed
```

3. Run API:

```bash
npm run dev
```

- Swagger UI: `http://localhost:8787/docs`
- OpenAPI JSON: `http://localhost:8787/doc`
- Health check: `GET http://localhost:8787/health`

## Default staff (after seed)

| Email | Password env | Role |
|-------|----------------|------|
| owner@elite.mm | SEED_OWNER_PASSWORD | owner |
| reception@elite.mm | SEED_RECEPTION_PASSWORD | reception |

## API base

All routes under `/api`:

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/dashboard`
- `GET /api/members`
- `POST /api/members`
- `POST /api/members/:id/checkins`
- `POST /api/members/:id/actions`
- `POST /api/trials`
- `GET /api/payments`
- `POST /api/contact`
