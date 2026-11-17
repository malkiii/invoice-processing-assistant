import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { createDatabase, type Database } from '../../../server/db/client'
import { runMigrations } from '../../../server/db/migrate'

export interface TestDatabase {
  url: string
  db: Database
  stop: () => Promise<void>
}

/** Starts a throwaway Postgres 16 container with all migrations applied. */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start()
  const url = container.getConnectionUri()
  await runMigrations(url)
  const { db, close } = createDatabase(url)
  return {
    url,
    db,
    stop: async () => {
      await close()
      await container.stop()
    },
  }
}
