# Production Release Runbook — Elite Gym V1.1.2

## Release gate

Do not deploy when any required migration, build, test, E2E, backup, security, environment or preflight check is failing.

## 1. Database safety

```bash
npm run release:preflight
npm run db:backup
npm run db:backup:verify
npm run db:migrate
```

Expected V1.1.2 migration history: `0001` through `0007`. After migrations, run preflight again. All duplicate/orphan invariant counters must be zero.

Production seeding is protected: `db:seed` refuses the `elite_gym` database unless `ALLOW_PRODUCTION_SEED=1` is explicitly supplied for an intentional first-time bootstrap. Normal releases must never reseed production.

## 2. Backend verification

```bash
npm run build
npm test
npm audit --audit-level=moderate
npm run security:scan
npm run release:preflight
npm run production:env:audit
npm run production:data:audit
```

`npm test` never uses the production database. It rewrites the target to `elite_gym_test`, recreates that isolated database, migrates/seeds it with test-only credentials, runs the full suite, then removes the database in a `finally` path.

Run a restore rehearsal for schema/recovery changes:

```bash
npm run db:restore:rehearsal
```

The rehearsal may only use an `elite_gym_restore_rehearsal_*` temporary database and must remove it afterwards.

## 3. Frontend verification

In `gym-frontend`:

```bash
npm run security:scan
npm run stitch:convert
npm run stitch:convert
npm run build
npm audit --audit-level=moderate
npm run e2e
```

Stitch conversion must remain 25/25 and deterministic across repeated runs. Local E2E may mutate the isolated/local environment. Production smoke must use `E2E_MUTATE=0`; remote mutation is refused unless the staging-only `E2E_ALLOW_REMOTE_MUTATION=1` escape hatch is deliberately supplied.

## 4. Deployment order

1. Confirm Backend CI and Frontend CI are green.
2. Create and verify a clean encrypted production backup.
3. Deploy backend.
4. Verify `/health`, `/ready`, `/doc`, security headers and production CORS.
5. Deploy frontend only after backend readiness passes.
6. Run production non-mutating browser smoke/E2E.
7. Run release preflight again.
8. Create and verify the final clean recovery-point backup.
9. Confirm Production Health workflow is green.
10. Record release commit, workflow runs and backup run in `GO_LIVE_CHECKLIST.md`.

Production frontend: `https://gym-frontend-three-psi.vercel.app`

Production backend: `https://gym-backend-wheat.vercel.app`

## 5. V1.1.2 production smoke

Verify at least:

- Owner and Reception login
- public membership packages
- trial registration UI availability (do not create a live trial during read-only smoke)
- member search/detail views
- configurable package management
- payment/read/report panels
- Member Portal authentication gate
- trainer directory/calendar views
- reports analytics panel
- notifications/settings operations
- zero unexpected browser JS errors and server 5xx responses

Mutating business flows belong in isolated test/staging, not the live production smoke.

## 6. Security checks

- `.env`, `.env.local`, `.backup-key`, backups, real passwords and tokens are not tracked by Git.
- `security:scan` passes in both repositories.
- Staff/member JWTs remain separated and token-version revocation works.
- RBAC matches Owner/Manager/Reception/Trainer/Accountant responsibilities.
- Member data remains scoped to the authenticated member.
- CORS contains only expected local origins and the production frontend.
- Rate limiting uses TiDB in production.
- Refund/Void never mutates the original receipt and cannot exceed remaining paid value.
- Security headers and request IDs remain enabled.
- Vercel Production uses a strong JWT secret; local development placeholders must never be promoted to production and should be rotated before any local production-mode run.

## 7. Scheduled production protection

Repository workflows provide:

- Production Health every 15 minutes.
- Production Backup daily with invariant check, encryption, verification and an encrypted GitHub artifact.
- Recovery Rehearsal weekly using an isolated temporary database.
- Persistent GitHub alert issue creation when a scheduled production check fails.

Required repository secrets are documented in `GO_LIVE_CHECKLIST.md`.

## 8. Release bookkeeping

- `git diff --check`
- review `git status`
- tracked-file secret scan
- commit backend and frontend separately
- push the normal branch without force
- create the next annotated release tag only after both CI pipelines are green
- record migration count, test/E2E totals and production URLs

Current baseline tag before this hardening work: `v1.1.1`.

## Rollback

Application-only failure: redeploy the prior known-good tag/commit.

Schema/data failure: follow `BACKUP_RUNBOOK.md`. Never blindly reverse production migrations and never restore a backup directly over production without restore-to-isolated-database validation.
