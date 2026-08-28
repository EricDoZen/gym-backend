# Elite Myanmar Gym Backend — V1

Production REST API for the single-branch Elite Myanmar Gym Management System.

## Stack

- Hono + TypeScript
- Drizzle ORM
- TiDB Cloud Serverless
- JWT staff/member authentication
- Vercel deployment

## Production endpoints

- API: `https://gym-backend-wheat.vercel.app`
- Health: `GET /health`
- Readiness: `GET /ready`
- Swagger UI: `/docs`
- OpenAPI JSON: `/doc`

## Local setup

```bash
cp .env.example .env
npm install
npm run db:check
npm run db:migrate
npm run db:seed   # first-time database only
npm run dev
```

Required production configuration is stored outside Git. `JWT_SECRET` must be unique and at least 32 characters in production. Seed passwords are required only when creating the initial staff accounts; never commit real passwords.

## Authentication boundaries

Staff and member sessions are deliberately separate.

- Staff JWT: `POST /api/auth/login`
- Member activation: `POST /api/member-auth/activate`
- Member JWT: `POST /api/member-auth/login`
- Staff JWT cannot access member-only endpoints.
- Member JWT cannot access staff-only endpoints.

Staff roles:

- `owner`: full administration, payments, staff management, audit log
- `reception`: reception/member workflows without owner-only mutations

## V1 API groups

- `/api/auth` — staff login, profile, password, staff accounts
- `/api/member-auth` — member activation/login/password/profile
- `/api/dashboard` — live operational metrics
- `/api/members` — member management and check-in
- `/api/trials` — public trial registration + staff conversion
- `/api/payments` — owner payment/receipt records with idempotency
- `/api/trainers` — trainer management
- `/api/portal` — member bookings/progress/workout/requests
- `/api/fitness` — staff progress/workout/trainer assignment/request approval
- `/api/ops` — owner audit log
- `/api/contact` — public contact form

## Database migrations

Migrations are applied in filename order and tracked in `schema_migrations`.

Current V1 schema:

1. `0001_init.sql`
2. `0002_production_hardening.sql`
3. `0003_operational_v1.sql`

Run:

```bash
npm run db:migrate
```

The V1 hardening adds application + database duplicate protection, member accounts, distributed TiDB rate limiting, audit logs, trainers, bookings, request approvals, progress/workout data, payment receipts/idempotency and trainer assignments.

## Backup

Create an AES-256-GCM encrypted backup:

```bash
npm run db:backup
npm run db:backup:verify
```

The encryption key is stored in `.backup-key`; backups are stored under `backups/`. Both are ignored by Git. Losing `.backup-key` makes encrypted backups unrecoverable, so store an external protected copy of the key.

See `BACKUP_RUNBOOK.md` for the recovery procedure.

## Verification

Before a production release:

```bash
npm run build
npm test
npm run db:backup
npm run db:backup:verify
```

Current acceptance suite includes authentication separation, duplicate member protection, transactional trial conversion, duplicate check-in protection, owner-only payments, payment idempotency/receipt uniqueness, distributed rate limiting, staff management, trainer assignment, booking collision protection, progress/workout APIs, approval workflows, readiness and audit logs.

## Release

See `PRODUCTION_RUNBOOK.md`. Production deployment must always verify `/health` and `/ready` after the backend deploy before releasing the frontend.
