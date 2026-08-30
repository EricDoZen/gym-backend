# Elite Gym Go-Live Checklist — V1.1.2

A release is technically go-live ready only when every automated gate below passes. Business-data items must be completed before the first real customer transaction.

## Automated technical gates

- [ ] Backend TypeScript build passes.
- [ ] Backend dependency audit reports no high/moderate release-blocking vulnerabilities.
- [ ] Backend tracked-file secret scan passes.
- [ ] 32/32 backend tests pass against isolated `elite_gym_test`.
- [ ] Test runner removes `elite_gym_test` after completion, including failure paths.
- [ ] Production release preflight reports zero invariant failures.
- [ ] Production environment audit passes.
- [ ] Encrypted production backup succeeds and verifies.
- [ ] Restore rehearsal succeeds in an `elite_gym_restore_rehearsal_*` database and removes it afterwards.
- [ ] Frontend Stitch conversion is 25/25.
- [ ] Running Stitch conversion twice produces no second diff.
- [ ] Frontend TypeScript/Vite production build passes.
- [ ] Frontend dependency audit passes.
- [ ] Frontend tracked-file secret scan passes.
- [ ] E2E runner refuses remote mutation unless the explicit staging-only escape hatch is supplied.
- [ ] Production non-mutating E2E/smoke has no required failures.
- [ ] `/health` is HTTP 200 with database connected.
- [ ] `/ready` is HTTP 200 with status ready.
- [ ] Production frontend and required deep links are HTTP 200.
- [ ] HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy and X-Request-Id are present.
- [ ] Production CORS allows the production frontend origin.
- [ ] Both repositories are clean at the release commit.

## CI / monitoring gates

- [ ] Backend CI `verify` succeeds.
- [ ] Backend CI isolated integration job succeeds using `TEST_DATABASE_URL`.
- [ ] Frontend CI succeeds including deterministic generation.
- [ ] Production Health scheduled workflow succeeds.
- [ ] Production Backup scheduled workflow succeeds.
- [ ] Recovery Rehearsal scheduled workflow succeeds.
- [ ] Production-alert issue creation is verified by workflow failure handling.

## Secrets / credentials

- [ ] Vercel Production uses a strong unique JWT secret of at least 32 characters; local development placeholders are never used for a production-mode run.
- [ ] `.env`, `.backup-key`, backups and tokens are not tracked by Git.
- [ ] GitHub `PRODUCTION_DATABASE_URL`, `TEST_DATABASE_URL` and `BACKUP_KEY_BASE64` repository secrets are configured.
- [ ] Backup key has a protected second copy independent of the source repository.
- [ ] Bootstrap/seed passwords are not shared staff credentials.
- [ ] Named staff accounts exist for actual employees.

## Business-data gate before first customer

- [ ] Gym legal/display name is confirmed.
- [ ] Address, phone/contact and opening hours are confirmed.
- [ ] Actual membership packages/prices/durations are entered and approved.
- [ ] Actual trainers and availability are entered.
- [ ] Actual staff accounts/roles are entered.
- [ ] Placeholder/demo members, trials, contacts, payments and check-ins are removed or confirmed as non-production data before first customer use.
- [ ] Terms, privacy and refund/void policy text is approved for the business.
- [ ] Revenue target/settings are confirmed.

## Human UAT

Perform once with actual operational staff before the first live customer:

- [ ] Owner login.
- [ ] Reception login.
- [ ] Create trial lead and convert to member.
- [ ] Search member and check in.
- [ ] Record payment and verify receipt.
- [ ] Refund/Void with correct permission; verify original receipt remains immutable.
- [ ] Freeze/Renew/Upgrade request and staff approval.
- [ ] Member Portal activation/login/password change.
- [ ] Trainer availability/time off/booking/conflict/completion.
- [ ] Reports show expected net revenue and attendance.
- [ ] Staff permission negative cases are confirmed.

## Rollback drill

- [ ] Frontend previous deployment rollback procedure tested.
- [ ] Backend previous release rollback procedure tested.
- [ ] Database backup restore-to-isolated-database tested.
- [ ] `/health`, `/ready`, login, member search and payment smoke are rechecked after rollback/recovery.

## Final sign-off

Release commit: ____________________

Backend workflow run: ____________________

Frontend workflow run: ____________________

Backup artifact/run: ____________________

UAT approver/date: ____________________

Go-live decision: GO / NO-GO
