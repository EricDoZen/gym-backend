import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'
import { env } from '../env.js'
import * as schema from './schema.js'

type Db = MySql2Database<typeof schema>

let pool: mysql.Pool | undefined
let db: Db | undefined

export function hasDatabase() {
  return Boolean(env.DATABASE_URL)
}

export function getDb(): Db {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured')
  }
  if (!db) {
    pool = mysql.createPool(env.DATABASE_URL)
    db = drizzle(pool, { schema, mode: 'default' })
  }
  return db
}

export async function closeDb() {
  if (pool) {
    await pool.end()
    pool = undefined
    db = undefined
  }
}

export { schema }
