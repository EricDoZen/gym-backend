# Backup & Recovery Runbook — Elite Gym V1.1.2

## Purpose

Protect production TiDB data before migrations/releases, keep an encrypted second copy, and continuously prove that backups restore without overwriting `elite_gym`.

## Backup format

`npm run db:backup` creates `elite-gym-<timestamp>.egymbak` encrypted with AES-256-GCM. The encryption key may come from `BACKUP_KEY_BASE64` (automation/secret manager) or the local `.backup-key` file. Both `.backup-key` and `backups/` are ignored by Git.

`BACKUP_DIR` can redirect the primary backup output. `BACKUP_OFFSITE_DIR` can create an additional filesystem copy, for example to an encrypted/synced external drive. Do not point the offsite path back into the repository.

V1.1.2 coverage is 24 tables including staff, packages/price history, members/accounts/trials/check-ins, payments/adjustments, membership actions, trainers/schedules, bookings/requests, fitness history, notifications, contacts, audit logs, settings and migration history.

## Automated protection

GitHub Actions:

- `Production Backup`: daily encrypted backup, invariant preflight, verification and encrypted artifact upload.
- `Recovery Rehearsal`: weekly backup + isolated restore verification.
- Failures create a persistent GitHub issue beginning with `ALERT: Elite Gym`.

Windows Task Scheduler is also configured on this workstation as an immediate local fallback: `Elite Gym Production Backup` daily at 02:30 and `Elite Gym Recovery Rehearsal` weekly on Sunday at 03:30. These local tasks currently run as the interactive `merm` user, so GitHub Actions is the preferred unattended/off-device layer once its repository secrets are configured.

Required repository secrets:

- `PRODUCTION_DATABASE_URL`
- `BACKUP_KEY_BASE64`

The encrypted artifact retention configured in GitHub is 30 days. Keep an additional long-term copy outside GitHub if business retention requirements exceed that period.

## Before every production database migration

```bash
npm run release:preflight
npm run db:backup
npm run db:backup:verify
```

Do not continue when preflight or verification fails.

## Key handling

- Never commit, log, paste, or send `.backup-key`/`BACKUP_KEY_BASE64` through chat/tickets.
- Keep a protected second copy of the key independent of the source repository.
- Backup files without the matching key are intentionally unrecoverable.
- Rotate keys only after retaining a final verified backup using the previous key.

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

1. decrypts the selected/latest verified backup;
2. creates a temporary database only under the `elite_gym_restore_rehearsal_` prefix;
3. applies all known migrations (`0001`–`0007`);
4. restores all data tables from the backup;
5. validates row counts and migration history; and
6. drops the temporary database in a `finally` block.

It refuses to drop a database outside the fixed rehearsal prefix. Production `elite_gym` is never the rehearsal target.

## Recovery procedure

1. Stop business mutations or place the application in maintenance mode.
2. Record current release/tag and `schema_migrations` state.
3. Create and verify a final backup of the current/damaged state when possible.
4. Select and authenticate the recovery backup with its matching key.
5. Restore into a separate recovery database first.
6. Apply migrations until schema matches the application release being restored.
7. Validate row counts, staff login/RBAC, member lookup, payments/adjustments, check-ins, trainers/bookings, reports and audit history.
8. Run backend isolated tests and application smoke checks; never aim automated tests at the recovery/production DB.
9. Only after validation, perform an explicit production cutover using TiDB administration procedures.
10. Verify `/health`, `/ready`, staff/member workflows and production frontend afterwards.

## Safety rule

There is intentionally no one-command destructive production restore in this repository. Production cutover remains an explicit database-administration operation after isolated recovery validation.
