import { PgBoss } from 'pg-boss'

export interface Worker {
  boss: PgBoss
  stop: () => Promise<void>
}

/**
 * Starts pg-boss (installing or migrating its schema if needed). Job handlers
 * over `server/domain` are registered here as later features add them.
 */
export async function startWorker(options: { databaseUrl: string }): Promise<Worker> {
  const boss = new PgBoss(options.databaseUrl)
  boss.on('error', (error) => console.error('[worker] pg-boss error', error))
  await boss.start()
  return {
    boss,
    stop: () => boss.stop({ graceful: true }),
  }
}
