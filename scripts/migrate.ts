import 'dotenv/config'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from '../src/env.js'
import {
  createTiDBConnection,
  getDatabaseTargetLabel,
} from '../src/db/config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '../src/db/migrations')

function splitStatements(sql: string) {
  return sql
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((statement) => !/^CREATE\s+DATABASE\b/i.test(statement))
    .filter((statement) => !/^USE\s+/i.test(statement))
}

async function main() {
  if (!env.DATABASE_URL && !env.DB_HOST) {
    console.error(
      'DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD is required. Copy .env.example to .env and set it.',
    )
    process.exit(1)
  }

  console.log(`Connecting to ${getDatabaseTargetLabel(false)} ...`)
  const adminConnection = createTiDBConnection(false)
  await adminConnection.execute(
    `CREATE DATABASE IF NOT EXISTS \`${env.DB_NAME.replace(/`/g, '')}\``,
  )

  const connection = createTiDBConnection(true)
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const migrationFiles = readdirSync(migrationsDir)
    .filter((name) => /^\d+.*\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b, 'en'))

  const appliedRows = (await connection.execute(
    'SELECT version FROM schema_migrations',
  )) as Array<{ version: string }>
  const applied = new Set(appliedRows.map((row) => String(row.version)))

  let appliedCount = 0
  for (const file of migrationFiles) {
    if (applied.has(file)) {
      console.log(`skip ${file}`)
      continue
    }

    console.log(`apply ${file}`)
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    for (const statement of splitStatements(sql)) {
      await connection.execute(statement)
    }
    await connection.execute(
      'INSERT INTO schema_migrations (version) VALUES (?)',
      [file],
    )
    appliedCount += 1
  }

  console.log(
    `Migration complete: ${migrationFiles.length} known, ${appliedCount} applied`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
