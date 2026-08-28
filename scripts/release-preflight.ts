import 'dotenv/config'
import { createTiDBConnection } from '../src/db/config.js'

async function duplicateGroups(
  connection: ReturnType<typeof createTiDBConnection>,
  sql: string,
) {
  const rows = await connection.execute(sql)
  return Array.isArray(rows) ? rows.length : 0
}

async function main() {
  const connection = createTiDBConnection(true)
  const checks = {
    memberPhones: await duplicateGroups(
      connection,
      'SELECT phone FROM members GROUP BY phone HAVING COUNT(*) > 1',
    ),
    memberEmails: await duplicateGroups(
      connection,
      "SELECT LOWER(email) AS email_key FROM members WHERE email IS NOT NULL AND email <> '' GROUP BY LOWER(email) HAVING COUNT(*) > 1",
    ),
    pendingRequests: await duplicateGroups(
      connection,
      "SELECT member_id, request_type FROM member_requests WHERE status='Pending' GROUP BY member_id, request_type HAVING COUNT(*) > 1",
    ),
    paymentReceipts: await duplicateGroups(
      connection,
      "SELECT receipt_no FROM payments WHERE receipt_no IS NOT NULL GROUP BY receipt_no HAVING COUNT(*) > 1",
    ),
    paymentIdempotency: await duplicateGroups(
      connection,
      "SELECT idempotency_key FROM payments WHERE idempotency_key IS NOT NULL GROUP BY idempotency_key HAVING COUNT(*) > 1",
    ),
    orphanMembershipActions: await duplicateGroups(
      connection,
      'SELECT a.id FROM membership_actions a LEFT JOIN members m ON m.id = a.member_id WHERE m.id IS NULL',
    ),
    orphanMemberAccounts: await duplicateGroups(
      connection,
      'SELECT a.id FROM member_accounts a LEFT JOIN members m ON m.id = a.member_id WHERE m.id IS NULL',
    ),
    orphanPayments: await duplicateGroups(
      connection,
      'SELECT p.id FROM payments p LEFT JOIN members m ON m.id = p.member_id WHERE m.id IS NULL',
    ),
    orphanCheckins: await duplicateGroups(
      connection,
      'SELECT c.id FROM checkins c LEFT JOIN members m ON m.id = c.member_id WHERE m.id IS NULL',
    ),
    orphanBookings: await duplicateGroups(
      connection,
      'SELECT b.id FROM bookings b LEFT JOIN members m ON m.id = b.member_id WHERE m.id IS NULL',
    ),
    orphanMemberRequests: await duplicateGroups(
      connection,
      'SELECT r.id FROM member_requests r LEFT JOIN members m ON m.id = r.member_id WHERE m.id IS NULL',
    ),
  }

  const failures = Object.entries(checks).filter(([, count]) => count > 0)
  console.log(JSON.stringify({ invariantFailures: checks }))
  if (failures.length) {
    throw new Error(
      `Release preflight failed: ${failures.map(([name, count]) => `${name}=${count}`).join(', ')}`,
    )
  }
  console.log('Release preflight PASS: no duplicate invariant groups found')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
