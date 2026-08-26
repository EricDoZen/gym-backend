import { connect, type Connection } from '@tidbcloud/serverless'
import { drizzle, type TiDBServerlessDatabase } from 'drizzle-orm/tidb-serverless'
import { env } from '../env.js'
import { getConnectConfig } from './config.js'
import * as schema from './schema.js'

type Db = TiDBServerlessDatabase<typeof schema>

let client: Connection | undefined
let db: Db | undefined

export function hasDatabase() {
  return Boolean(env.DATABASE_URL || env.DB_HOST)
}

export function getDb(): Db {
  if (!env.DATABASE_URL && !env.DB_HOST) {
    throw new Error('DATABASE_URL is not configured')
  }
  if (!db) {
    client = connect(getConnectConfig(true))
    db = drizzle(client, { schema })
  }
  return db
}

export async function closeDb() {
  client = undefined
  db = undefined
}

export { schema }
