import { connect, type Config, type Connection } from '@tidbcloud/serverless'
import { env } from '../env.js'

function parseDatabaseUrl(url: string): Config {
  return { url }
}

function parseDiscreteEnv(): Config | null {
  if (!env.DB_HOST || !env.DB_USER || !env.DB_PASSWORD) return null

  return {
    host: env.DB_HOST,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME || undefined,
  }
}

function withoutDatabase(config: Config): Config {
  if ('url' in config && config.url) {
    const parsed = new URL(String(config.url).replace(/^mysql:/, 'http:'))
    return {
      host: parsed.hostname,
      username: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
    }
  }

  const { database: _database, ...rest } = config
  return rest
}

export function getConnectConfig(includeDatabase = true): Config {
  const discrete = parseDiscreteEnv()
  const base =
    discrete ??
    (env.DATABASE_URL
      ? parseDatabaseUrl(env.DATABASE_URL)
      : (() => {
          throw new Error('DATABASE_URL is not configured')
        })())

  if (!includeDatabase) {
    return withoutDatabase(base)
  }

  if ('url' in base && base.url) {
    return base
  }

  if (!base.database) {
    return { ...base, database: env.DB_NAME }
  }

  return base
}

export function createTiDBConnection(includeDatabase = true): Connection {
  return connect(getConnectConfig(includeDatabase))
}

export function getDatabaseTargetLabel(includeDatabase = true) {
  const config = getConnectConfig(includeDatabase)

  if ('url' in config && config.url) {
    try {
      const parsed = new URL(String(config.url).replace(/^mysql:/, 'http:'))
      const db = includeDatabase
        ? parsed.pathname.replace(/^\//, '') || env.DB_NAME
        : '(no db)'
      return `${parsed.hostname}:${parsed.port || 4000}/${db}`
    } catch {
      return String(config.url)
    }
  }

  const db = includeDatabase ? config.database ?? env.DB_NAME : '(no db)'
  return `${config.host}:4000/${db}`
}
