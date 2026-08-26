import 'dotenv/config'
import { env } from '../src/env.js'
import {
  createTiDBConnection,
  getDatabaseTargetLabel,
} from '../src/db/config.js'

async function tryConnect(label: string, includeDatabase: boolean) {
  console.log(`→ ${label}: ${getDatabaseTargetLabel(includeDatabase)}`)
  const connection = createTiDBConnection(includeDatabase)
  const result = await connection.execute('SELECT VERSION() AS version')
  console.log('  OK', result)
  return true
}

async function main() {
  if (!env.DATABASE_URL && !env.DB_HOST) {
    console.error('Set DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD in .env')
    process.exit(1)
  }

  try {
    await tryConnect('Connect without database', false)
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    console.error('  Failed without database:', err.code ?? err.message)
  }

  try {
    await tryConnect('Connect with database', true)
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    console.error('  Failed with database:', err.code ?? err.message)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Connection failed:', error.code ?? error.message)
  process.exit(1)
})
