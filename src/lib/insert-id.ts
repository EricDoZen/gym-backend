type InsertResult = {
  insertId?: number | string | null
  lastInsertId?: number | string | null
}

export function getInsertId(result: InsertResult) {
  return Number(result.lastInsertId ?? result.insertId ?? 0)
}
