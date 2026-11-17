import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema'

export function createDatabase(url: string) {
  const pool = new pg.Pool({ connectionString: url })
  const db = drizzle(pool, { schema, casing: 'snake_case' })
  return { db, close: () => pool.end() }
}

export type Database = ReturnType<typeof createDatabase>['db']
