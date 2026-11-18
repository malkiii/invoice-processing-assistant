// Google Drive and Dropbox intake in the worker (ticket 12): downloads each picked file through
// its User's Source Connection, then hands the stored Document to the `extract-document` queue.
import type { PgBoss } from 'pg-boss'
import type { Database } from '../db/client'
import type { ExtractionQueue } from '../domain/extraction-queue'
import {
  createSourceFetchQueue,
  createSourceIntake,
  FETCH_SOURCE_FILE_QUEUE,
  type FetchSourceFileJob,
  type SourceIntake,
} from '../domain/source-intake'
import type { ObjectStorage } from '../domain/storage'
import type { SourceConnections } from '../lib/source-connections'

/** Downloads at most this many files at once per worker process. */
const CONCURRENT_DOWNLOADS = 4

/** Consumes download jobs. The queue must already exist (createSourceFetchQueue creates it). */
export async function registerSourceFetchWorker(
  boss: PgBoss,
  intake: Pick<SourceIntake, 'fetchDocument'>,
): Promise<void> {
  await boss.work<FetchSourceFileJob>(
    FETCH_SOURCE_FILE_QUEUE,
    { localConcurrency: CONCURRENT_DOWNLOADS },
    async ([job]) => {
      await intake.fetchDocument(job!.data.documentId)
    },
  )
}

/** Wires Source intake with production adapters and starts consuming download jobs. */
export async function startSourceFetching(
  boss: PgBoss,
  deps: { db: Database; storage: ObjectStorage; extractionQueue: ExtractionQueue; sources: SourceConnections },
): Promise<void> {
  const intake = createSourceIntake({
    db: deps.db,
    storage: deps.storage,
    extractionQueue: deps.extractionQueue,
    fetchQueue: await createSourceFetchQueue(boss),
    download: deps.sources.download,
  })
  await registerSourceFetchWorker(boss, intake)
}
