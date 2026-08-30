import 'dotenv/config'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import {
  TEST_DATABASE_NAME,
  assertTestDatabaseName,
  databaseNameFromSettings,
  databaseUrlForDatabase,
} from '../src/lib/database-safety.js'

const TEST_OWNER_PASSWORD = 'TestOwner2026!Isolated'
const TEST_RECEPTION_PASSWORD = 'TestReception2026!Isolated'
const TEST_JWT_SECRET = 'test-only-jwt-secret-elite-gym-2026-isolated'
const rootDir = process.cwd()
const tsxCli = resolve(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const vitestCli = resolve(rootDir, 'node_modules', 'vitest', 'vitest.mjs')

function configureTestEnvironment() {
  process.env.NODE_ENV = 'test'
  process.env.DB_NAME = TEST_DATABASE_NAME
  process.env.SEED_OWNER_PASSWORD = TEST_OWNER_PASSWORD
  process.env.SEED_RECEPTION_PASSWORD = TEST_RECEPTION_PASSWORD
  process.env.JWT_SECRET = TEST_JWT_SECRET

  if (process.env.DATABASE_URL) {
    process.env.DATABASE_URL = databaseUrlForDatabase(
      process.env.DATABASE_URL,
      TEST_DATABASE_NAME,
    )
  }

  const database = databaseNameFromSettings(
    process.env.DATABASE_URL,
    process.env.DB_NAME,
  )
  assertTestDatabaseName(database, 'Test suite')
}

function runNode(args: string[]) {
  const result = spawnSync(process.execPath, args, {
    cwd: rootDir,
    env: process.env,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  return result.status ?? 1
}

async function dropTestDatabase() {
  const { createTiDBConnection } = await import('../src/db/config.js')
  const admin = createTiDBConnection(false)
  assertTestDatabaseName(TEST_DATABASE_NAME, 'Test database reset')
  await admin.execute(`DROP DATABASE IF EXISTS \`${TEST_DATABASE_NAME}\``)
}

async function main() {
  configureTestEnvironment()
  if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
    throw new Error(
      'Integration test suite requires DATABASE_URL or discrete TiDB credentials; production data will never be used.',
    )
  }

  await dropTestDatabase()
  try {
    if (runNode([tsxCli, 'scripts/migrate.ts']) !== 0) {
      throw new Error('Test database migration failed')
    }
    if (runNode([tsxCli, 'scripts/seed.ts']) !== 0) {
      throw new Error('Test database seed failed')
    }

    const testArgs = process.argv.slice(2)
    const status = runNode([vitestCli, 'run', ...testArgs])
    if (status !== 0) process.exitCode = status
  } finally {
    await dropTestDatabase()
    console.log(`Isolated test database removed: ${TEST_DATABASE_NAME}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
