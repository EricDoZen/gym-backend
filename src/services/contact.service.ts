import { getDb } from '../db/client.js'
import { contactMessages } from '../db/schema.js'

export async function submitContact(payload: Record<string, string>) {
  const db = getDb()
  await db.insert(contactMessages).values({ payload })
  return true
}
