import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import { env } from '../src/env.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  if (!env.DATABASE_URL) {
    console.error('DATABASE_URL is required. Copy .env.example to .env and set it.')
    process.exit(1)
  }

  const sqlPath = join(__dirname, '../src/db/migrations/0001_init.sql')
  const sql = readFileSync(sqlPath, 'utf8')
  const statements = sql
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)

  const connection = await mysql.createConnection(env.DATABASE_URL)
  try {
    for (const statement of statements) {
      await connection.query(statement)
    }
    console.log('Migration complete: elite_gym schema ready')
  } finally {
    await connection.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
