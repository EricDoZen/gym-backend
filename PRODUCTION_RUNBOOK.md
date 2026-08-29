# Production Release Runbook — Elite Gym V1.1

## Release gate

Do not deploy when any required migration, build, test, E2E, backup, security or preflight check is failing.

## 1. Database safety

```bash
npm run release:preflight
npm run db:backup
npm run db:backup:verify
npm run db:migrate
```

Expected V1.1 migration history: `0001` through `0007`.

V1.1 migrations `0005`–`0007` add the configurable package engine, package price history, payment snapshots/adjustments, five staff roles, trainer schedules/time off, member notes and notifications.

After migrations, run preflight again. All duplicate/orphan invariant counters must be zero.

## 2. Backend verification

```bash
npm run build
npm test
npm audit --audit-level=moderate
npm run release:preflight
```

The release suite must include V1.1 RBAC, Refund/Void, trainer scheduling, member overview, reports and notification tests in addition to V1 hardening tests.

Run a restore rehearsal for schema/recovery changes:

```bash
npm run db:restore:rehearsal
```

The rehearsal must use only a temporary `elite_gym_restore_rehearsal_*` database and remove it afterwards.

## 3. Frontend verification

In `gym-frontend`:

```bash
npm run stitch:convert
npm run build
npm audit --audit-level=moderate
npm run e2e
```

Expected Stitch conversion is all registered screens. Local Browser E2E must finish with zero FAIL/PARTIAL pages and all business flows passing.

Production mode must use the live backend and must not expose staff passwords or mock business actions.

## 4. Deployment order

1. Create and verify a clean encrypted production backup.
2. Deploy backend.
3. Verify:
   - `/health` → 200 + database connected
   - `/ready` → 200 + ready
   - `/doc` → current release version and V1.1 paths
4. Deploy frontend only after backend readiness passes.
5. Run production browser smoke/E2E.
6. Cleanup strictly identified E2E records.
7. Run release preflight again.
8. Create and verify the final clean recovery-point backup.

Production frontend: `https://gym-frontend-three-psi.vercel.app`
Production backend: `https://gym-backend-wheat.vercel.app`

## 5. V1.1 production smoke

Verify at least:

- Owner and Reception login
- public membership packages
- trial registration and conversion
- member search/detail/check-in
- configurable package management
- payment + receipt + membership action
- refund/void adjustment permissions
- Member Portal activation/login/requests/booking
- trainer directory/calendar operations
- reports analytics panel
- notifications/settings operations
- zero unexpected browser JS errors and server 5xx responses

## 6. Security checks

- `.env`, `.env.local`, `.backup-key`, backups, real passwords and tokens are not tracked by Git.
- Staff/member JWTs remain separated.
- Token-version revocation still works after password/account changes.
- RBAC permissions match Owner/Manager/Reception/Trainer/Accountant responsibilities.
- Reception cannot adjust/refund payments or manage staff/packages.
- Trainer cannot access payments/staff administration.
- Accountant cannot manage staff/trainers/packages.
- Member data remains scoped to the authenticated member.
- CORS contains only expected local origins and the production frontend.
- Rate limiting uses TiDB in production.
- Refund/Void never mutates the original receipt and cannot exceed remaining paid value.
- Security headers and request IDs remain enabled.

## 7. Release bookkeeping

- `git diff --check`
- review `git status`
- staged secret scan
- commit backend and frontend separately
- push the normal branch without force
- create annotated release tag `v1.1.0` only if it does not already exist
- record migration count, test/E2E totals and production URLs

## Rollback

Application-only failure: redeploy the prior known-good tag/commit.

Schema/data failure: follow `BACKUP_RUNBOOK.md`. Do not blindly reverse production migrations and never restore a backup directly over production without restore-to-test validation.
