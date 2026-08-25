# Gym Backend (TiDB)

REST API for Elite Myanmar gym management.

## Setup

1. Copy env file and set `DATABASE_URL`:

```bash
cp .env.example .env
```

2. Install and migrate:

```bash
npm install
npm run db:migrate
npm run db:seed
```

3. Run API:

```bash
npm run dev
```

Health check: `GET http://localhost:8787/health`

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
