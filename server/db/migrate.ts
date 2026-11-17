import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import { seedBuiltInTemplate } from '../domain/templates'
import * as schema from './schema'

const defaultMigrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url))

/** Applies pending drizzle-kit migrations, then seeds built-in rows. Safe to run on every start. */
export async function runMigrations(
  url: string,
  migrationsFolder = process.env.MIGRATIONS_DIR ?? defaultMigrationsFolder,
): Promise<void> {
  const pool = new pg.Pool({ connectionString: url, max: 1 })
  try {
    const db = drizzle(pool, { schema, casing: 'snake_case' })
    await migrate(db, { migrationsFolder })
    await seedBuiltInTemplate(db)
  } finally {
    await pool.end()
  }
}
