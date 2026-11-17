// URL intake in the worker (ticket 10): downloads each submitted URL, then hands the stored
// Document to the `extract-document` queue.
import type { PgBoss } from 'pg-boss'
import { createDatabase } from '../db/client'
import { createExtractionQueue } from '../domain/extraction-queue'
import { createHttpsTransport, resolveWithSystemDns } from '../domain/https-transport'
import { createS3Storage } from '../domain/storage'
import { fetchUrl } from '../domain/url-fetch'
import { createUrlFetchQueue, createUrlIntake, FETCH_URL_QUEUE, type FetchUrlJob, type UrlIntake } from '../domain/url-intake'
import { readStorageConfig } from '../lib/storage-config'

/** Downloads at most this many URLs at once per worker process. */
const CONCURRENT_FETCHES = 4

/** Consumes fetch jobs. The queue must already exist (createUrlFetchQueue creates it). */
export async function registerUrlFetchWorker(boss: PgBoss, intake: Pick<UrlIntake, 'fetchDocument'>): Promise<void> {
  await boss.work<FetchUrlJob>(FETCH_URL_QUEUE, { localConcurrency: CONCURRENT_FETCHES }, async ([job]) => {
    await intake.fetchDocument(job!.data.documentId)
  })
}

/** Wires URL intake with production adapters and starts consuming fetch jobs. Returns a closer. */
export async function startUrlFetching(boss: PgBoss, options: { databaseUrl: string }): Promise<() => Promise<void>> {
  const database = createDatabase(options.databaseUrl)
  const transport = createHttpsTransport()
  const intake = createUrlIntake({
    db: database.db,
    storage: createS3Storage(readStorageConfig()),
    extractionQueue: await createExtractionQueue(boss),
    fetchQueue: await createUrlFetchQueue(boss),
    fetchUrl: (url, limits) => fetchUrl(url, { resolve: resolveWithSystemDns, transport, limits }),
  })
  await registerUrlFetchWorker(boss, intake)
  return database.close
}
