import { sql } from 'drizzle-orm'

// Liveness/readiness probe used by Docker healthchecks.
export default defineEventHandler(async () => {
  await useDb().execute(sql`select 1`)
  return { status: 'ok' }
})
