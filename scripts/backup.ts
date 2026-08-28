import 'dotenv/config'
import { createCipheriv, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTiDBConnection, getDatabaseTargetLabel } from '../src/db/config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const backupDir = join(rootDir, 'backups')
const keyPath = join(rootDir, '.backup-key')
const tables = [
  'staff_users',
  'membership_packages',
  'members',
  'member_accounts',
  'trial_registrations',
  'checkins',
  'payments',
  'membership_actions',
  'trainers',
  'member_trainer_assignments',
  'bookings',
  'member_requests',
  'progress_entries',
  'workout_plans',
  'contact_messages',
  'audit_logs',
  'app_settings',
  'schema_migrations',
] as const

function loadOrCreateKey() {
  if (existsSync(keyPath)) {
    const key = Buffer.from(readFileSync(keyPath, 'utf8').trim(), 'base64')
    if (key.length !== 32) throw new Error('.backup-key must decode to exactly 32 bytes')
    return key
  }
  const key = randomBytes(32)
  writeFileSync(keyPath, key.toString('base64'), { encoding: 'utf8', mode: 0o600 })
  return key
}

function jsonReplacer(_key: string, value: unknown) {
  return typeof value === 'bigint' ? value.toString() : value
}

async function main() {
  mkdirSync(backupDir, { recursive: true })
  const connection = createTiDBConnection(true)
  const data: Record<string, unknown> = {}
  for (const table of tables) {
    data[table] = await connection.execute(`SELECT * FROM \`${table}\``)
  }

  const payload = Buffer.from(
    JSON.stringify(
      {
        format: 'elite-gym-backup-v1',
        createdAt: new Date().toISOString(),
        database: getDatabaseTargetLabel(true),
        tables: data,
      },
      jsonReplacer,
    ),
    'utf8',
  )

  const key = loadOrCreateKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()])
  const tag = cipher.getAuthTag()
  const envelope = Buffer.concat([Buffer.from('EGYM1'), iv, tag, ciphertext])

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const output = join(backupDir, `elite-gym-${stamp}.egymbak`)
  writeFileSync(output, envelope)
  console.log(`Encrypted backup created: ${output}`)
  console.log(`Tables: ${tables.length}; encrypted bytes: ${envelope.length}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
