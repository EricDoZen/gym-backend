import 'dotenv/config'
import { defineConfig } from 'vitest/config'
import {
  TEST_DATABASE_NAME,
  databaseUrlForDatabase,
} from './src/lib/database-safety.js'

process.env.NODE_ENV = 'test'
process.env.DB_NAME = TEST_DATABASE_NAME
process.env.JWT_SECRET = 'test-only-jwt-secret-elite-gym-2026-isolated'
process.env.SEED_OWNER_PASSWORD = 'TestOwner2026!Isolated'
process.env.SEED_RECEPTION_PASSWORD = 'TestReception2026!Isolated'

if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = databaseUrlForDatabase(
    process.env.DATABASE_URL,
    TEST_DATABASE_NAME,
  )
}

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
