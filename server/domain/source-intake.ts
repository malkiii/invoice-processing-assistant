/**
 * Google Drive and Dropbox intake (ticket 12): the User picks files in the Google Picker or the
 * Dropbox Chooser, one Batch per pick; the worker downloads each file through the User's Source
 * Connection, stores it like an upload and queues it for extraction. A Document's name is the
 * file name the provider showed; its `sourceRef` is the provider's file id.
 */
import type { PgBoss } from 'pg-boss'
import type { Database } from '../db/client'
import { batch, document } from '../db/schema'
import type { DocumentLimits } from './document-inspection'
import type { DocumentRow } from './document-library'
import type { ExtractionQueue } from './extraction-queue'
import { MAX_FILES_PER_BATCH } from './intake'
import { failDocument, fetchRemoteDocument, type RemoteDownload } from './remote-intake'
import { isSourceKind, type SourceKind } from './source-providers'
import type { ObjectStorage } from './storage'

/** pg-boss queue holding one job per picked file waiting to be downloaded. */
export const FETCH_SOURCE_FILE_QUEUE = 'fetch-source-file'

export interface FetchSourceFileJob {
  documentId: string
}

export interface SourceFetchQueue {
  enqueue(documentId: string): Promise<void>
}

/** Creates the queue if needed and returns a producer for it. The consumer lives in the worker. */
export async function createSourceFetchQueue(boss: PgBoss): Promise<SourceFetchQueue> {
  // fetchDocument records download failures itself; retries only cover crashes (database, storage, network).
  await boss.createQueue(FETCH_SOURCE_FILE_QUEUE, {
    retryLimit: 2,
    retryDelay: 10,
    retryBackoff: true,
    expireInSeconds: 300,
  })
  return {
    async enqueue(documentId) {
      const job: FetchSourceFileJob = { documentId }
      await boss.send(FETCH_SOURCE_FILE_QUEUE, job)
    },
  }
}

/** A file as the Google Picker or Dropbox Chooser describes it. */
export interface PickedFile {
  id: string
  name: string
}

export interface StartedSourceDocument {
  id: string
  name: string
  status: DocumentRow['status']
  failureReason: string | null
}

export interface StartedSourceBatch {
  batchId: string
  documents: StartedSourceDocument[]
}

export type SourceDownloader = (
  userId: string,
  kind: SourceKind,
  fileId: string,
  limits: DocumentLimits,
) => Promise<RemoteDownload>

export interface SourceIntake {
  /** Creates one Batch for the picked files; each becomes a `fetching` Document with a download job. */
  startSourceBatch(userId: string, kind: SourceKind, files: PickedFile[]): Promise<StartedSourceBatch>
  /**
   * Worker step: downloads a `fetching` Document through its User's Source Connection, checks it
   * like an upload and queues it for extraction, or marks it `failed` with the reason.
   */
  fetchDocument(documentId: string): Promise<DocumentRow | null>
}

export function createSourceIntake(deps: {
  db: Database
  storage: ObjectStorage
  extractionQueue: ExtractionQueue
  fetchQueue: SourceFetchQueue
  download: SourceDownloader
}): SourceIntake {
  const { db, storage, extractionQueue, fetchQueue } = deps

  return {
    async startSourceBatch(userId, kind, files) {
      if (files.length === 0) throw new RangeError('A Batch needs at least one file.')
      if (files.length > MAX_FILES_PER_BATCH) {
        throw new RangeError(`A Batch can hold at most ${MAX_FILES_PER_BATCH} files.`)
      }

      const started = await db.transaction(async (tx) => {
        const [created] = await tx.insert(batch).values({ userId, source: kind }).returning()
        const rows = await tx
          .insert(document)
          .values(
            files.map((file) => ({
              userId,
              batchId: created!.id,
              source: kind,
              name: file.name,
              sourceRef: file.id,
              status: 'fetching' as const,
            })),
          )
          .returning()
        return { batchId: created!.id, rows }
      })

      const documents = await Promise.all(
        started.rows.map(async (row): Promise<StartedSourceDocument> => {
          try {
            await fetchQueue.enqueue(row.id)
          } catch (error) {
            console.error('[source-intake] could not enqueue download', error)
            row = await failDocument(db, row.id, 'The file could not be queued for download. Try again.')
          }
          return { id: row.id, name: row.name, status: row.status, failureReason: row.failureReason }
        }),
      )
      return { batchId: started.batchId, documents }
    },

    fetchDocument: (documentId) =>
      fetchRemoteDocument({ db, storage, extractionQueue }, documentId, async (row, limits) => {
        if (!isSourceKind(row.source) || !row.sourceRef) {
          return { ok: false, reason: 'This Document has no file to download.' }
        }
        return deps.download(row.userId, row.source, row.sourceRef, limits)
      }),
  }
}
