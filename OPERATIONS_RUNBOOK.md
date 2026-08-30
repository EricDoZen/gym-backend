# Elite Gym Operations Runbook — V1.1.2

This runbook is for the day-to-day operation of the single-branch production system.

## Opening checklist

1. Confirm the public site loads.
2. Confirm staff login works for the duty account.
3. Confirm `/health` reports `database: connected` and `/ready` reports `status: ready`.
4. Confirm yesterday's Production Backup workflow succeeded.
5. Resolve any open GitHub issue whose title starts with `ALERT: Elite Gym` before taking payments if the alert affects backend/database/recovery.

## Staff roles

- Owner: all operational and staff-management permissions.
- Manager: operational administration except staff management.
- Reception: member registration/search/check-in/payment creation and normal front-desk work.
- Trainer: member coaching context, notes and fitness operations; no payment/staff administration.
- Accountant: payment adjustments and reports; no staff/package/trainer administration.

Use named individual staff accounts in production. Do not share the bootstrap Owner/Reception password between employees.

## Member registration

1. Search by phone/name first to avoid duplicate records.
2. Convert an existing trial lead when present instead of creating a second member.
3. Select the actual package purchased.
4. Verify phone number and optional email before saving.
5. Confirm membership status and expiry on the member overview.

## Check-in

1. Search/select the member.
2. Confirm membership is Active and not expired/frozen.
3. Use Check-in once only; duplicate immediate check-ins are rejected by the backend.
4. If check-in is blocked, resolve membership state instead of bypassing it.

## Payments

1. Select the correct member and package.
2. Confirm amount and payment method.
3. Record payment once and keep the generated receipt number.
4. Never edit a historical receipt to correct a refund/void; use an adjustment entry.
5. Refund/Void must remain within the unadjusted paid amount and requires the appropriate permission.

## Membership changes

Freeze, renew, upgrade and downgrade are auditable actions. Member Portal requests remain Pending until an authorized staff member approves/rejects them. Do not modify database rows manually to bypass package rules.

## Trainer bookings

Maintain trainer weekly availability and time off before accepting bookings. Overlapping bookings and time-off conflicts are rejected by the backend. Update session status to Completed/No-show as part of daily operations so trainer reports remain correct.

## Password/account incidents

- Owner can reset staff passwords.
- Member password changes revoke older member sessions through token versioning.
- Staff password/account changes revoke older staff sessions through token versioning.
- Never send passwords, JWTs, `.env`, `.backup-key`, or TiDB credentials through chat/tickets.

## Application incident

1. Check the GitHub Production Health workflow and Vercel deployment status.
2. Check `/health` and `/ready` separately.
3. If frontend only is failing, roll back the frontend deployment.
4. If backend application code is failing but DB is healthy, roll back backend to the previous known-good release.
5. If database integrity is in doubt, stop business mutations and follow `BACKUP_RUNBOOK.md`.
6. Never restore directly over production without restore-to-isolated-database validation.

## Backup/recovery

- GitHub Production Backup: daily encrypted recovery artifact.
- GitHub Recovery Rehearsal: weekly isolated restore rehearsal.
- Local/release backup: run before schema changes and important releases.
- Backup encryption key must remain outside Git and have a protected second copy.

Manual release backup:

```bash
npm run release:preflight
npm run db:backup
npm run db:backup:verify
```

## Closing checklist

1. Confirm payments/check-ins from the day appear in reports.
2. Resolve or document pending membership requests.
3. Confirm no unexplained server 5xx or production alert is active.
4. Do not manually delete member/payment/audit records as a cleanup shortcut.

## Scheduled maintenance

- Every 15 minutes: production health/readiness/security-header/frontend checks.
- Daily: encrypted production backup + invariant preflight + backup verification.
- Weekly: encrypted backup + restore rehearsal into `elite_gym_restore_rehearsal_*` + automatic removal.
- Every release: build, audit, secret scan, isolated tests, database preflight, backup, deploy, smoke, final backup.
