import 'dotenv/config'
import { createDecipheriv } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createTiDBConnection,
  createTiDBConnectionForDatabase,
} from '../src/db/config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const backupDir = resolve(process.env.BACKUP_DIR ?? join(rootDir, 'backups'))
const keyPath = join(rootDir, '.backup-key')
const migrationsDir = join(rootDir, 'src', 'db', 'migrations')
const restorePrefix = 'elite_gym_restore_rehearsal_'

function resolveBackupPath() {
  const requested = process.argv.find((arg) => arg.endsWith('.egymbak'))
  if (requested) return resolve(requested)
  const latest = readdirSync(backupDir)
    .filter((name) => name.endsWith('.egymbak'))
    .sort()
    .at(-1)
  if (!latest) throw new Error('No .egymbak backup found')
  return join(backupDir, latest)
}

function decryptBackup() {
  const configured = process.env.BACKUP_KEY_BASE64?.trim()
  if (!configured && !existsSync(keyPath)) throw new Error('Backup key is missing')
  const key = Buffer.from(configured ?? readFileSync(keyPath, 'utf8').trim(), 'base64')
  if (key.length !== 32) throw new Error('Invalid backup key length')

  const backupPath = resolveBackupPath()
  const envelope = readFileSync(backupPath)
  if (envelope.subarray(0, 5).toString('utf8') !== 'EGYM1') {
    throw new Error('Unknown backup format')
  }
  const decipher = createDecipheriv('aes-256-gcm', key, envelope.subarray(5, 17))
  decipher.setAuthTag(envelope.subarray(17, 33))
  const plaintext = Buffer.concat([
    decipher.update(envelope.subarray(33)),
    decipher.final(),
  ])
  const payload = JSON.parse(plaintext.toString('utf8')) as {
    format?: string
    createdAt?: string
    tables?: Record<string, Array<Record<string, unknown>>>
  }
  if (payload.format !== 'elite-gym-backup-v1' || !payload.tables) {
    throw new Error('Backup payload is invalid')
  }
  return { backupPath, payload }
}

function splitStatements(sql: string) {
  return sql
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((statement) => !/^CREATE\s+DATABASE\b/i.test(statement))
    .filter((statement) => !/^USE\s+/i.test(statement))
}

function sqlValue(value: unknown) {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return JSON.stringify(value)
  return value
}

async function main() {
  const { backupPath, payload } = decryptBackup()
  const suffix = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  const database = `${restorePrefix}${suffix}`
  if (!database.startsWith(restorePrefix)) throw new Error('Unsafe rehearsal database name')

  const admin = createTiDBConnection(false)
  console.log(`Restore rehearsal source: ${backupPath}`)
  console.log(`Temporary database: ${database}`)

  try {
    await admin.execute(`CREATE DATABASE \`${database}\``)
    const connection = createTiDBConnectionForDatabase(database)

    const migrationFiles = readdirSync(migrationsDir)
      .filter((name) => /^\d+.*\.sql$/i.test(name))
      .sort((a, b) => a.localeCompare(b, 'en'))

    for (const file of migrationFiles) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8')
      for (const statement of splitStatements(sql)) {
        await connection.execute(statement)
      }
    }

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) NOT NULL PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)

    const tableEntries = Object.entries(payload.tables).filter(
      ([table]) => table !== 'schema_migrations',
    )

    for (const [table, rows] of tableEntries) {
      if (!/^[A-Za-z0-9_]+$/.test(table)) throw new Error(`Unsafe table name: ${table}`)
      for (const row of rows) {
        const columns = Object.keys(row)
        if (!columns.length) continue
        if (columns.some((column) => !/^[A-Za-z0-9_]+$/.test(column))) {
          throw new Error(`Unsafe column name in ${table}`)
        }
        const placeholders = columns.map(() => '?').join(', ')
        const columnSql = columns.map((column) => `\`${column}\``).join(', ')
        await connection.execute(
          `INSERT INTO \`${table}\` (${columnSql}) VALUES (${placeholders})`,
          columns.map((column) => sqlValue(row[column])),
        )
      }
    }

    for (const file of migrationFiles) {
      await connection.execute(
        'INSERT INTO schema_migrations (version) VALUES (?)',
        [file],
      )
    }

    for (const [table, rows] of tableEntries) {
      const result = (await connection.execute(
        `SELECT COUNT(*) AS total FROM \`${table}\``,
      )) as Array<{ total: number | string }>
      const restored = Number(result[0]?.total ?? -1)
      if (restored !== rows.length) {
        throw new Error(
          `Restore count mismatch for ${table}: expected ${rows.length}, got ${restored}`,
        )
      }
    }

    const migrationRows = (await connection.execute(
      'SELECT COUNT(*) AS total FROM schema_migrations',
    )) as Array<{ total: number | string }>
    if (Number(migrationRows[0]?.total ?? -1) !== migrationFiles.length) {
      throw new Error('Migration history was not rebuilt correctly')
    }

    console.log(
      `Restore rehearsal PASS: ${tableEntries.length} data tables restored and ${migrationFiles.length} migrations applied`,
    )
    console.log(`Backup created: ${payload.createdAt ?? 'unknown'}`)
  } finally {
    if (!database.startsWith(restorePrefix)) {
      throw new Error('Refusing to drop a database outside the rehearsal prefix')
    }
    await admin.execute(`DROP DATABASE IF EXISTS \`${database}\``)
    console.log(`Temporary database removed: ${database}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
