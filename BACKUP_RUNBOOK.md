# Backup & Recovery Runbook — Elite Gym V1

## Purpose

Protect production TiDB data before migrations/releases and provide a deterministic recovery path without storing plaintext customer or credential data in Git.

## Backup format

`npm run db:backup` reads the V1 operational tables and creates `backups/elite-gym-<timestamp>.egymbak`.

The payload is encrypted with AES-256-GCM. The key is stored locally in `.backup-key` and is ignored by Git.

Covered tables include staff, packages, members, member accounts, trials, check-ins, payments, actions, trainers, trainer assignments, bookings, requests, progress, workout plans, contacts, audit logs, settings and migration history.

## Before every production database migration

```bash
npm run db:backup
npm run db:backup:verify
```

Do not continue with a migration when verification fails.

## Key handling

- Never commit `.backup-key`.
- Never paste the key into tickets/chat/logs.
- Keep at least one encrypted external copy of the key in a protected password manager or equivalent secret store.
- Backup files without the matching key are intentionally unreadable.
- Rotate the backup key only after creating and retaining a final verified backup with the old key.

## Retention recommendation

- Daily: keep 7
- Weekly: keep 4
- Monthly: keep 6
- Keep a release backup for every production schema migration

## Verification

```bash
npm run db:backup:verify
```

Verification authenticates/decrypts the envelope and checks that the payload/table structure is valid. It does not modify TiDB.

## Restore rehearsal

Before a release that changes the database or recovery tooling, run:

```bash
npm run db:restore:rehearsal
```

The rehearsal decrypts the latest verified backup, creates a temporary database whose name begins with `elite_gym_restore_rehearsal_`, applies every known migration, restores all backup rows, compares row counts, verifies migration history, and drops the temporary database in a `finally` block. It refuses to drop a database outside that fixed rehearsal prefix.

This is the required proof that the encrypted backup can be restored without writing over `elite_gym`.

## Recovery procedure

1. Stop business mutations or place the app in maintenance mode.
2. Record the current release/tag and `schema_migrations` state.
3. Create and verify one final backup of the damaged/current state when possible.
4. Choose the backup to recover and verify it with the matching `.backup-key`.
5. Restore only into a separate test/recovery database first.
6. Run application migrations against the recovery database until its schema matches the release being restored.
7. Load recovered rows in dependency-safe order and validate counts, staff login, member lookup, payments, check-ins and audit history.
8. Run backend tests/smoke tests against the recovery database.
9. Only after validation, perform the production cutover using TiDB tooling/administration procedures.
10. Verify `/health`, `/ready`, staff login and member flows after cutover.

## Safety rule

The repository intentionally does not contain a one-command destructive production restore. Production restore/cutover must remain an explicit database-administration operation after a restore-to-test validation. This prevents an accidental local command from overwriting live customer data.
