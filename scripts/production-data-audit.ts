import 'dotenv/config'
import { createTiDBConnection } from '../src/db/config.js'
import { env } from '../src/env.js'
import {
  PRODUCTION_DATABASE_NAME,
  databaseNameFromSettings,
} from '../src/lib/database-safety.js'

async function scalar(connection: ReturnType<typeof createTiDBConnection>, sql: string) {
  const rows = (await connection.execute(sql)) as Array<Record<string, unknown>>
  const row = rows[0] ?? {}
  return Number(Object.values(row)[0] ?? 0)
}

async function main() {
  const database = databaseNameFromSettings(env.DATABASE_URL, env.DB_NAME)
  if (database !== PRODUCTION_DATABASE_NAME) {
    throw new Error(`Production data audit expects ${PRODUCTION_DATABASE_NAME}; got ${database || '(none)'}`)
  }

  const connection = createTiDBConnection(true)
  const metrics = {
    staff: await scalar(connection, 'SELECT COUNT(*) AS total FROM staff_users'),
    packages: await scalar(connection, 'SELECT COUNT(*) AS total FROM membership_packages WHERE is_active = TRUE'),
    members: await scalar(connection, 'SELECT COUNT(*) AS total FROM members'),
    trainers: await scalar(connection, 'SELECT COUNT(*) AS total FROM trainers WHERE is_active = TRUE'),
    seedMembers: await scalar(
      connection,
      "SELECT COUNT(*) AS total FROM members WHERE member_code IN ('EM-2401','EM-2402','EM-2403','EM-2404') AND full_name IN ('Aung Min','Thiri Aye','Kyaw Lin','Su Mon')",
    ),
    showcaseMembers: await scalar(
      connection,
      "SELECT COUNT(*) AS total FROM members WHERE member_code LIKE 'DEMO-%' AND email LIKE '%@demo.elite.local'",
    ),
    placeholderStaff: await scalar(
      connection,
      "SELECT COUNT(*) AS total FROM staff_users WHERE full_name IN ('Gym Owner','Reception Staff')",
    ),
  }

  console.log(JSON.stringify({ productionDataAudit: metrics }))

  const failures: string[] = []
  const warnings: string[] = []
  if (metrics.staff < 1) failures.push('no active production staff accounts are available')
  if (metrics.packages < 1) failures.push('no active membership packages are available')
  if (metrics.seedMembers > 0) failures.push(`${metrics.seedMembers} legacy seed member record(s) remain in production`)
  if (metrics.showcaseMembers > 0) warnings.push(`${metrics.showcaseMembers} reversible DEMO showcase member record(s) are intentionally enabled`)
  if (metrics.trainers === 0) warnings.push('no active trainers are configured yet')
  if (metrics.placeholderStaff > 0) warnings.push(`${metrics.placeholderStaff} bootstrap staff profile(s) still use placeholder display names`)
  if (metrics.members === 0) warnings.push('production has no members yet; this is valid before opening but must be intentional')

  if (warnings.length) {
    console.log(`Production data audit warnings (${warnings.length}):`)
    for (const warning of warnings) console.log(`- ${warning}`)
  }
  if (failures.length) {
    console.error(`Production data audit FAIL (${failures.length})`)
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log('Production data audit PASS')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
