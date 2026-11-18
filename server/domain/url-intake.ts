/**
 * URL intake: the User submits URLs, one Batch per submission; the worker downloads each URL
 * (through the SSRF guard in url-fetch.ts), stores it like an upload and queues it for extraction.
 * A Document's name is the URL as submitted.
 */
import type { PgBoss } from 'pg-boss'
import type { Database } from '../db/client'
import { batch, document } from '../db/schema'
import type { DocumentLimits } from './document-inspection'
import type { DocumentRow } from './document-library'
import type { ExtractionQueue } from './extraction-queue'
import { MAX_FILES_PER_BATCH } from './intake'
import { checkUrl } from './ssrf-guard'
import { failDocument, fetchRemoteDocument } from './remote-intake'
import type { ObjectStorage } from './storage'
import type { UrlFetchResult } from './url-fetch'

/** pg-boss queue holding one job per URL Document waiting to be downloaded. */
export const FETCH_URL_QUEUE = 'fetch-url'

export interface FetchUrlJob {
  documentId: string
}

export interface UrlFetchQueue {
  enqueue(documentId: string): Promise<void>
}

/** Creates the queue if needed and returns a producer for it. The consumer lives in the worker. */
export async function createUrlFetchQueue(boss: PgBoss): Promise<UrlFetchQueue> {
  // fetchDocument records fetch failures itself; retries only cover crashes (database, storage).
  await boss.createQueue(FETCH_URL_QUEUE, { retryLimit: 2, retryDelay: 10, retryBackoff: true, expireInSeconds: 300 })
  return {
    async enqueue(documentId) {
      const job: FetchUrlJob = { documentId }
      await boss.send(FETCH_URL_QUEUE, job)
    },
  }
}

export interface StartedUrlDocument {
  id: string
  name: string
  status: DocumentRow['status']
  failureReason: string | null
}

export interface StartedUrlBatch {
  batchId: string
  documents: StartedUrlDocument[]
}

export interface UrlIntake {
  /**
   * Creates one Batch for the submitted lines (blank lines ignored). Each URL becomes a Document:
   * `fetching` with a download job, or `failed` at once when the URL itself is refused.
   */
  startUrlBatch(userId: string, lines: string[]): Promise<StartedUrlBatch>
  /**
   * Worker step: downloads a `fetching` Document's URL, checks it like an upload and queues it
   * for extraction, or marks it `failed` with the reason. Any other status is left unchanged;
   * null when the Document no longer exists (deleted while waiting).
   */
  fetchDocument(documentId: string): Promise<DocumentRow | null>
}

export function createUrlIntake(deps: {
  db: Database
  storage: ObjectStorage
  extractionQueue: ExtractionQueue
  fetchQueue: UrlFetchQueue
  fetchUrl: (url: string, limits: DocumentLimits) => Promise<UrlFetchResult>
}): UrlIntake {
  const { db, storage, extractionQueue, fetchQueue } = deps

  return {
    async startUrlBatch(userId, lines) {
      const urls = lines.map((line) => line.trim()).filter(Boolean)
      if (urls.length === 0) throw new RangeError('A Batch needs at least one URL.')
      if (urls.length > MAX_FILES_PER_BATCH) {
        throw new RangeError(`A Batch can hold at most ${MAX_FILES_PER_BATCH} URLs.`)
      }

      const started = await db.transaction(async (tx) => {
        const [created] = await tx.insert(batch).values({ userId, source: 'url' }).returning()
        const rows = await tx
          .insert(document)
          .values(
            urls.map((url) => {
              const checked = checkUrl(url)
              return {
                userId,
                batchId: created!.id,
                source: 'url' as const,
                name: url,
                status: checked.ok ? ('fetching' as const) : ('failed' as const),
                failureReason: checked.ok ? null : checked.reason,
              }
            }),
          )
          .returning()
        return { batchId: created!.id, rows }
      })

      const documents = await Promise.all(
        started.rows.map(async (row): Promise<StartedUrlDocument> => {
          if (row.status === 'fetching') {
            try {
              await fetchQueue.enqueue(row.id)
            } catch (error) {
              console.error('[url-intake] could not enqueue fetch', error)
              row = await failDocument(db, row.id, 'The URL could not be queued for download. Try again.')
            }
          }
          return { id: row.id, name: row.name, status: row.status, failureReason: row.failureReason }
        }),
      )
      return { batchId: started.batchId, documents }
    },

    fetchDocument: (documentId) =>
      fetchRemoteDocument({ db, storage, extractionQueue }, documentId, (row, limits) => deps.fetchUrl(row.name, limits)),
  }
}
