import { PgBoss } from 'pg-boss'
import { EXTRACT_DOCUMENT_QUEUE } from '../domain/extraction-queue'
import type { ExtractionJob, ExtractionRunner } from '../domain/extraction/runner'

export interface Worker {
  boss: PgBoss
  stop: () => Promise<void>
}

export interface ExtractionWorkerOptions {
  runner: ExtractionRunner
  /**
   * Jobs this process works on at once, across all Users. The per-User limit is enforced
   * separately by the runner (instance setting `maxConcurrentDocumentsPerUser`).
   */
  concurrency?: number
  pollingIntervalSeconds?: number
}

/** Long enough for a slow model with retries and a repair attempt; the runner times out each call. */
const EXTRACTION_EXPIRE_SECONDS = 60 * 60

/**
 * Starts pg-boss (installing or migrating its schema if needed) and registers the job handlers
 * over `server/domain`.
 */
export async function startWorker(options: {
  databaseUrl: string
  extraction?: ExtractionWorkerOptions
}): Promise<Worker> {
  const boss = new PgBoss(options.databaseUrl)
  boss.on('error', (error) => console.error('[worker] pg-boss error', error))
  await boss.start()

  if (options.extraction) {
    const { runner, concurrency = 8, pollingIntervalSeconds } = options.extraction
    await boss.createQueue(EXTRACT_DOCUMENT_QUEUE)
    await boss.updateQueue(EXTRACT_DOCUMENT_QUEUE, { expireInSeconds: EXTRACTION_EXPIRE_SECONDS })
    await boss.work<ExtractionJob>(
      EXTRACT_DOCUMENT_QUEUE,
      { batchSize: 1, localConcurrency: concurrency, ...(pollingIntervalSeconds && { pollingIntervalSeconds }) },
      async ([job]) => {
        if (!job) return
        const outcome = await runner.process(job.data)
        // Busy (per-User limit reached) or paused (broken Provider Connection): try again later.
        if (outcome.kind === 'deferred') {
          await boss.send(EXTRACT_DOCUMENT_QUEUE, job.data, { startAfter: outcome.seconds })
        }
      },
    )
  }

  return {
    boss,
    stop: () => boss.stop({ graceful: true }),
  }
}
