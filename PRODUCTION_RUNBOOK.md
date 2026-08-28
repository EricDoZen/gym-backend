# Production Release Runbook — Elite Gym V1

## Release gate

Do not deploy when any required build/test/E2E/security check is failing.

## 1. Database safety

```bash
npm run db:backup
npm run db:backup:verify
npm run db:migrate
```

Expected V1 migration history: `0001`, `0002`, `0003`.

## 2. Backend verification

```bash
npm run build
npm test
```

Then deploy backend to Vercel and verify:

- `GET https://gym-backend-wheat.vercel.app/health` → 200 + database connected
- `GET https://gym-backend-wheat.vercel.app/ready` → 200 + ready
- Swagger `/docs` and OpenAPI `/doc` load

## 3. Frontend verification

In `gym-frontend`:

```bash
npm run stitch:convert
npm run build
npm run e2e
```

Production mode must use the real backend and must not expose staff passwords or mock business actions.

## 4. Frontend deployment

Deploy frontend after backend readiness passes.

Production: `https://gym-frontend-three-psi.vercel.app`

Verify:

- public pages
- Owner login
- Reception login
- trial registration
- trial conversion/member lookup
- Member Portal activation/login
- booking
- freeze/renew request → owner approval
- payments/receipts
- trainers
- progress/workout read
- settings/operations

## 5. Security checks

- No `.env`, `.backup-key`, encrypted backup, token or real password is tracked by Git.
- Staff/member JWTs remain separated.
- Reception is denied owner-only payment/staff mutations.
- Member data is scoped to the authenticated member.
- CORS contains only expected localhost development origins and the production frontend.
- Production JWT secret is not a documented/default value.
- Rate limiting uses TiDB in production.
- Security headers and request IDs are enabled.

## 6. Release bookkeeping

- `git diff --check`
- Review `git status`
- Commit backend and frontend
- Push both repositories
- Tag `v1.0.0` for the V1 release
- Record migration version and production URLs in release notes

## Rollback

Application-only failure: redeploy the prior known-good Git tag/commit.

Schema/data failure: follow `BACKUP_RUNBOOK.md`; do not blindly reverse production migrations or overwrite TiDB from an unverified file.
