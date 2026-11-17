// Export generation in the worker (ticket 08): renders Exports too large for the request.
import type { PgBoss } from 'pg-boss'
import type { Database } from '../db/client'
import { createExportQueue, createExports, GENERATE_EXPORT_QUEUE, type GenerateExportJob } from '../domain/export/exports'
import type { ObjectStorage } from '../domain/storage'

/** Large Exports hold every Invoice in memory while rendering, so only a couple run at once. */
const CONCURRENT_EXPORTS = 2

export async function startExportGeneration(boss: PgBoss, deps: { db: Database; storage: ObjectStorage }): Promise<void> {
  const exports = createExports({ ...deps, queue: await createExportQueue(boss) })
  await boss.work<GenerateExportJob>(GENERATE_EXPORT_QUEUE, { localConcurrency: CONCURRENT_EXPORTS }, async ([job]) => {
    await exports.generate(job!.data.exportId)
  })
}
