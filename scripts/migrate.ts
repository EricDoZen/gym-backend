import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from '../src/env.js'
import {
  createTiDBConnection,
  getDatabaseTargetLabel,
} from '../src/db/config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  if (!env.DATABASE_URL && !env.DB_HOST) {
    console.error(
      'DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD is required. Copy .env.example to .env and set it.',
    )
    process.exit(1)
  }

  const sqlPath = join(__dirname, '../src/db/migrations/0001_init.sql')
  const sql = readFileSync(sqlPath, 'utf8')
  const statements = sql
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)

  console.log(`Connecting to ${getDatabaseTargetLabel(false)} ...`)
  const connection = createTiDBConnection(false)
  try {
    for (const statement of statements) {
      await connection.execute(statement)
    }
    console.log('Migration complete: elite_gym schema ready')
  } finally {
    // Stateless HTTP driver; nothing to close.
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
