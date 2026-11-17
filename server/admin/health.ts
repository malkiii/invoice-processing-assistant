import { sql } from 'drizzle-orm'
import type { Database } from '../db/client'

export type ComponentHealth =
  | { status: 'ok' }
  | { status: 'down'; error: string }
  | { status: 'not-configured' }

export interface SystemHealth {
  database: ComponentHealth
  storage: ComponentHealth
  queue: { status: 'ok'; queued: number; active: number } | { status: 'down'; error: string }
}

function errorMessage(error: unknown): string {
  // Drizzle wraps driver errors as "Failed query: <sql>"; the cause says what went wrong.
  if (error instanceof Error && error.cause instanceof Error) return error.cause.message
  return error instanceof Error ? error.message : String(error)
}

async function probe(check: () => Promise<unknown>): Promise<ComponentHealth> {
  try {
    await check()
    return { status: 'ok' }
  } catch (error) {
    return { status: 'down', error: errorMessage(error) }
  }
}

/**
 * Checks the database, object storage and the pg-boss queue. Queue depth is
 * read straight from pg-boss's tables, so the web process needs no pg-boss
 * instance; "down" there usually means the worker has never started.
 */
export async function checkSystemHealth(deps: {
  db: Database
  checkStorage: (() => Promise<void>) | null
}): Promise<SystemHealth> {
  const { db, checkStorage } = deps
  const [database, storage, queue] = await Promise.all([
    probe(() => db.execute(sql`select 1`)),
    checkStorage ? probe(checkStorage) : Promise.resolve({ status: 'not-configured' } as const),
    readQueueDepth(db),
  ])
  return { database, storage, queue }
}

async function readQueueDepth(db: Database): Promise<SystemHealth['queue']> {
  try {
    const { rows } = await db.execute<{ queued: number; active: number }>(sql`
      select
        count(*) filter (where state in ('created', 'retry'))::int as queued,
        count(*) filter (where state = 'active')::int as active
      from pgboss.job
    `)
    const { queued, active } = rows[0]!
    return { status: 'ok', queued, active }
  } catch (error) {
    return { status: 'down', error: errorMessage(error) }
  }
}
