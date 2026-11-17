import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

const defaultMigrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url))

/** Applies pending drizzle-kit migrations. Safe to run on every start. */
export async function runMigrations(
  url: string,
  migrationsFolder = process.env.MIGRATIONS_DIR ?? defaultMigrationsFolder,
): Promise<void> {
  const pool = new pg.Pool({ connectionString: url, max: 1 })
  try {
    await migrate(drizzle(pool), { migrationsFolder })
  } finally {
    await pool.end()
  }
}
