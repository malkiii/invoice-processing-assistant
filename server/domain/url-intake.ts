/**
 * URL intake: the User submits URLs, one Batch per submission; the worker downloads each URL
 * (through the SSRF guard in url-fetch.ts), stores it like an upload and queues it for extraction.
 * A Document's name is the URL as submitted.
 */
import { and, eq } from 'drizzle-orm'
import type { PgBoss } from 'pg-boss'
import type { Database } from '../db/client'
import { getInstanceSettings } from '../db/instance-settings'
import { batch, document } from '../db/schema'
import { inspectDocument, type DocumentLimits } from './document-inspection'
import type { DocumentRow } from './document-library'
import type { ExtractionQueue } from './extraction-queue'
import { MAX_FILES_PER_BATCH } from './intake'
import { checkUrl } from './ssrf-guard'
import type { ObjectStorage } from './storage'
import { storageKeyFor } from './storage-keys'
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

  async function fail(documentId: string, reason: string, extra: Partial<DocumentRow> = {}) {
    const [row] = await db
      .update(document)
      .set({ ...extra, status: 'failed', failureReason: reason })
      .where(eq(document.id, documentId))
      .returning()
    return row!
  }

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
              row = await fail(row.id, 'The URL could not be queued for download. Try again.')
            }
          }
          return { id: row.id, name: row.name, status: row.status, failureReason: row.failureReason }
        }),
      )
      return { batchId: started.batchId, documents }
    },

    async fetchDocument(documentId) {
      const [row] = await db.select().from(document).where(eq(document.id, documentId))
      if (!row) return null
      if (row.status !== 'fetching') return row

      const settings = await getInstanceSettings(db)
      const limits = { maxDocumentBytes: settings.maxDocumentBytes, maxDocumentPages: settings.maxDocumentPages }
      const fetched = await deps.fetchUrl(row.name, limits)
      if (!fetched.ok) return fail(row.id, fetched.reason)

      const sizeBytes = fetched.bytes.length
      const result = await inspectDocument(fetched.bytes, limits)
      if (!result.ok) return fail(row.id, result.reason, { sizeBytes })

      const key = storageKeyFor(row.userId, row.id)
      await storage.write(key, fetched.bytes, result.mimeType)

      // Only the run that moves the Document out of `fetching` enqueues it.
      const [queued] = await db
        .update(document)
        .set({
          status: 'queued',
          storageKey: key,
          sizeBytes,
          format: result.format,
          mimeType: result.mimeType,
          pageCount: result.pageCount,
        })
        .where(and(eq(document.id, row.id), eq(document.status, 'fetching')))
        .returning()
      if (!queued) return (await db.select().from(document).where(eq(document.id, row.id)))[0]!

      try {
        await extractionQueue.enqueue(queued.id)
      } catch (error) {
        console.error('[url-intake] could not enqueue extraction', error)
        return fail(queued.id, 'The Document could not be queued for extraction. Try again.')
      }
      return queued
    },
  }
}
