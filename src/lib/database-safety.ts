export const PRODUCTION_DATABASE_NAME = 'elite_gym'
export const TEST_DATABASE_NAME = 'elite_gym_test'
export const STAGING_DATABASE_NAME = 'elite_gym_staging'

export function databaseNameFromSettings(databaseUrl?: string, dbName?: string) {
  if (databaseUrl) {
    try {
      const parsed = new URL(databaseUrl.replace(/^mysql:/, 'http:'))
      const pathname = decodeURIComponent(parsed.pathname.replace(/^\//, '')).trim()
      if (pathname) return pathname
    } catch {
      // Let the normal database configuration layer report malformed URLs.
    }
  }
  return (dbName ?? '').trim()
}

export function databaseUrlForDatabase(databaseUrl: string, database: string) {
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error(`Unsafe database name: ${database}`)
  }
  const parsed = new URL(databaseUrl.replace(/^mysql:/, 'http:'))
  parsed.pathname = `/${database}`
  return parsed.toString().replace(/^http:/, 'mysql:')
}

export function isProductionDatabaseName(database: string) {
  return database.toLowerCase() === PRODUCTION_DATABASE_NAME
}

export function assertTestDatabaseName(database: string, operation: string) {
  if (database !== TEST_DATABASE_NAME) {
    throw new Error(
      `${operation} refused: expected isolated test database ${TEST_DATABASE_NAME}, got ${database || '(none)'}`,
    )
  }
}

export function assertNonProductionDatabase(database: string, operation: string) {
  if (!database || isProductionDatabaseName(database)) {
    throw new Error(
      `${operation} refused for protected production database ${database || '(unknown)'}`,
    )
  }
}
