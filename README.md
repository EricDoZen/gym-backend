# Elite Myanmar Gym Backend — V1.1

Production REST API for the single-branch Elite Myanmar Gym Management System.

## Stack

- Hono + TypeScript
- Drizzle ORM + TiDB Cloud Serverless
- Separate JWT sessions for staff and members
- Permission-based RBAC
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

Production secrets and seed passwords live outside Git. `JWT_SECRET` must be unique and at least 32 characters in production.

## Authentication and RBAC

Staff and member sessions are deliberately separate. Password changes/reset increment token versions so previously issued sessions are revoked.

Staff roles:

- `owner` — all permissions including staff management
- `manager` — operations administration except staff management
- `reception` — members, check-in, payments, package/trainer read access
- `trainer` — member read/notes plus fitness operations
- `accountant` — payments, adjustments and reports

Authorization is enforced through granular permissions such as `member.read`, `payment.adjust`, `package.manage`, `fitness.write`, `reports.view` and `staff.manage`.

## V1.1 capabilities

- Configurable membership package engine and price history
- DB-driven renew/upgrade/downgrade rules
- Package snapshots on payments
- Atomic payment + membership changes with idempotency
- Immutable receipts with refund/void adjustment ledger
- Member command-center overview and append-only staff notes
- Trainer availability, time off, calendar, completed/no-show sessions
- Net revenue/trial conversion/expiry/attendance/trainer reports
- Internal member/staff notification queue with dedupe
- Trial conversion, check-ins, member portal, progress/workout and approval workflows
- Audit logs, distributed TiDB rate limiting, request IDs and readiness checks

## Database migrations

Migrations are filename-ordered and tracked in `schema_migrations`.

1. `0001_init.sql`
2. `0002_production_hardening.sql`
3. `0003_operational_v1.sql`
4. `0004_release_hardening.sql`
5. `0005_v1_1_package_engine.sql`
6. `0006_v1_1_package_defaults.sql`
7. `0007_v1_1_operations.sql`

```bash
npm run release:preflight
npm run db:migrate
```

Release preflight must report zero duplicate/orphan invariant groups.

## Backup and recovery

```bash
npm run db:backup
npm run db:backup:verify
npm run db:restore:rehearsal
```

V1.1 encrypted backups cover 24 tables including package price history, payment adjustments, trainer schedule/time off, member notes, notifications and migration history. `.backup-key` and `backups/` are ignored by Git.

See `BACKUP_RUNBOOK.md` for recovery rules.

## Verification

```bash
npm run build
npm test
npm audit --audit-level=moderate
npm run release:preflight
```

The V1.1 suite covers authentication separation, RBAC, package rules, payment idempotency/atomic membership changes, refund/void bounds, trainer scheduling, member overview/notes, reports, notification dedupe, check-in protection and production hardening.

See `PRODUCTION_RUNBOOK.md` before every production release.
