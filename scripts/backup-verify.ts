import { createDecipheriv } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const backupDir = join(rootDir, 'backups')
const keyPath = join(rootDir, '.backup-key')

function resolveBackupPath() {
  const requested = process.argv[2]
  if (requested) return resolve(requested)
  const latest = readdirSync(backupDir)
    .filter((name) => name.endsWith('.egymbak'))
    .sort()
    .at(-1)
  if (!latest) throw new Error('No .egymbak backup found')
  return join(backupDir, latest)
}

function main() {
  if (!existsSync(keyPath)) throw new Error('.backup-key is missing')
  const key = Buffer.from(readFileSync(keyPath, 'utf8').trim(), 'base64')
  if (key.length !== 32) throw new Error('Invalid backup key length')

  const backupPath = resolveBackupPath()
  const envelope = readFileSync(backupPath)
  if (envelope.subarray(0, 5).toString('utf8') !== 'EGYM1') {
    throw new Error('Unknown backup format')
  }
  const iv = envelope.subarray(5, 17)
  const tag = envelope.subarray(17, 33)
  const ciphertext = envelope.subarray(33)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  const payload = JSON.parse(plaintext.toString('utf8')) as {
    format?: string
    createdAt?: string
    tables?: Record<string, unknown[]>
  }
  if (payload.format !== 'elite-gym-backup-v1' || !payload.tables) {
    throw new Error('Backup payload is invalid')
  }
  const tableSummary = Object.entries(payload.tables).map(([table, rows]) => ({
    table,
    rows: Array.isArray(rows) ? rows.length : -1,
  }))
  if (tableSummary.some((entry) => entry.rows < 0)) throw new Error('Backup table payload is invalid')
  console.log(`Backup verified: ${backupPath}`)
  console.log(`Created: ${payload.createdAt ?? 'unknown'}; tables: ${tableSummary.length}`)
  console.log(tableSummary.map((entry) => `${entry.table}=${entry.rows}`).join(', '))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
