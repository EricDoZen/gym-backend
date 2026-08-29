# Backup & Recovery Runbook — Elite Gym V1.1

## Purpose

Protect production TiDB data before migrations/releases and prove that encrypted backups can be restored without overwriting the live `elite_gym` database.

## Backup format

`npm run db:backup` creates `backups/elite-gym-<timestamp>.egymbak` encrypted with AES-256-GCM. The matching key is stored locally in `.backup-key`; both key and backup directory are ignored by Git.

V1.1 coverage is 24 tables including:

- staff and membership packages
- package price history
- members/member accounts/trials/check-ins
- payments and immutable refund/void adjustments
- membership actions
- trainers, availability, time off and assignments
- bookings and member requests
- progress/workout plans/member notes
- internal notifications
- contacts, audit logs, settings and migration history

## Before every production database migration

```bash
npm run release:preflight
npm run db:backup
npm run db:backup:verify
```

Do not continue when preflight or verification fails.

## Key handling

- Never commit or paste `.backup-key` into chat/tickets/logs.
- Keep at least one protected external copy of the key.
- Backup files without the matching key are intentionally unrecoverable.
- Rotate keys only after retaining a final verified backup using the previous key.

## Retention recommendation

- Daily: keep 7
- Weekly: keep 4
- Monthly: keep 6
- Keep a verified release backup for every production schema migration/tag

## Verification

```bash
npm run db:backup:verify
```

Verification authenticates/decrypts the AES-GCM envelope and validates the table payload without modifying TiDB.

## Restore rehearsal

```bash
npm run db:restore:rehearsal
```

The rehearsal:

1. decrypts the latest verified backup;
2. creates a temporary database named only with the `elite_gym_restore_rehearsal_` prefix;
3. applies all known migrations (`0001`–`0007` for V1.1);
4. restores every data table included in the backup;
5. compares restored row counts and migration history; and
6. drops the temporary database in a `finally` block.

It refuses to drop a database outside the fixed rehearsal prefix. The production `elite_gym` database is never the rehearsal target.

## Recovery procedure

1. Stop business mutations or place the application in maintenance mode.
2. Record the current release/tag and `schema_migrations` state.
3. Create and verify one final backup of the current/damaged state when possible.
4. Select and authenticate the recovery backup with its matching key.
5. Restore into a separate test/recovery database first.
6. Apply migrations until the recovery schema matches the application release being restored.
7. Restore rows and validate counts, staff login/RBAC, member lookup, payments/adjustments, check-ins, trainers/bookings, reports and audit history.
8. Run backend tests and smoke checks against the recovery database.
9. Only after validation, perform an explicit production cutover using TiDB administration procedures.
10. Verify `/health`, `/ready`, staff/member workflows and production frontend afterwards.

## Safety rule

There is intentionally no one-command destructive production restore in this repository. Production cutover remains an explicit database-administration operation after restore-to-test validation.
