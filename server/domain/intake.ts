import { and, eq } from 'drizzle-orm'
import type { Database } from '../db/client'
import { getInstanceSettings } from '../db/instance-settings'
import { batch, document } from '../db/schema'
import { checkSize, inspectDocument } from './document-inspection'
import type { DocumentRow } from './document-library'
import type { DocumentStatus } from './documents'
import type { ExtractionQueue } from './extraction-queue'
import type { ObjectStorage, PresignedUpload } from './storage'
import { storageKeyFor } from './storage-keys'

/** A file the browser is about to upload, as it describes it. Its size is re-checked after upload. */
export interface UploadRequest {
  name: string
  size: number
}

export interface StartedDocument {
  id: string
  name: string
  status: DocumentStatus
  failureReason: string | null
  /** Absent when the Document already failed (for example a declared size over the limit). */
  upload?: PresignedUpload
}

export interface StartedBatch {
  batchId: string
  documents: StartedDocument[]
}


export interface Intake {
  /** Creates one Batch for one intake action, with a Document and a presigned upload per file. */
  startUploadBatch(userId: string, files: UploadRequest[]): Promise<StartedBatch>
  /**
   * Checks an uploaded file (size, content-sniffed format, page count) and either queues the
   * Document for extraction or marks it `failed` with the reason. Confirming a Document that is
   * no longer `uploading` returns it unchanged. Throws DocumentNotFoundError for another User's.
   */
  confirmUpload(userId: string, documentId: string): Promise<DocumentRow>
}

export class DocumentNotFoundError extends Error {
  constructor(documentId: string) {
    super(`Document ${documentId} not found`)
    this.name = 'DocumentNotFoundError'
  }
}

export const MAX_FILES_PER_BATCH = 1000


export function createIntake(deps: {
  db: Database
  storage: ObjectStorage
  queue: ExtractionQueue
}): Intake {
  const { db, storage, queue } = deps

  async function fail(documentId: string, reason: string, extra: Partial<DocumentRow> = {}) {
    const [row] = await db
      .update(document)
      .set({ ...extra, status: 'failed', failureReason: reason })
      .where(eq(document.id, documentId))
      .returning()
    return row!
  }

  return {
    async startUploadBatch(userId, files) {
      if (files.length === 0) throw new RangeError('A Batch needs at least one file.')
      if (files.length > MAX_FILES_PER_BATCH) {
        throw new RangeError(`A Batch can hold at most ${MAX_FILES_PER_BATCH} files.`)
      }
      const limits = await getInstanceSettings(db)

      return db.transaction(async (tx) => {
        const [created] = await tx.insert(batch).values({ userId, source: 'upload' }).returning()
        const rows = await tx
          .insert(document)
          .values(
            files.map((file) => {
              const tooLarge = checkSize(file.size, limits)
              return {
                userId,
                batchId: created!.id,
                source: 'upload' as const,
                name: file.name,
                status: tooLarge ? ('failed' as const) : ('uploading' as const),
                failureReason: tooLarge,
                sizeBytes: tooLarge ? file.size : null,
              }
            }),
          )
          .returning()

        const documents = await Promise.all(
          rows.map(async (row): Promise<StartedDocument> => {
            const started = { id: row.id, name: row.name, status: row.status, failureReason: row.failureReason }
            if (row.status !== 'uploading') return started
            const key = storageKeyFor(userId, row.id)
            await tx.update(document).set({ storageKey: key }).where(eq(document.id, row.id))
            return { ...started, upload: await storage.presignUpload(key) }
          }),
        )
        return { batchId: created!.id, documents }
      })
    },

    async confirmUpload(userId, documentId) {
      const [row] = await db
        .select()
        .from(document)
        .where(and(eq(document.id, documentId), eq(document.userId, userId)))
      if (!row) throw new DocumentNotFoundError(documentId)
      if (row.status !== 'uploading' || !row.storageKey) return row

      const limits = await getInstanceSettings(db)
      const size = await storage.size(row.storageKey)
      if (size === null) return fail(row.id, 'The upload did not complete.')
      const tooLarge = checkSize(size, limits)
      if (tooLarge) return fail(row.id, tooLarge, { sizeBytes: size })

      const result = await inspectDocument(await storage.read(row.storageKey), limits)
      if (!result.ok) return fail(row.id, result.reason, { sizeBytes: size })

      // Only the request that moves the Document out of `uploading` enqueues it.
      const [queued] = await db
        .update(document)
        .set({
          status: 'queued',
          sizeBytes: size,
          format: result.format,
          mimeType: result.mimeType,
          pageCount: result.pageCount,
        })
        .where(and(eq(document.id, row.id), eq(document.status, 'uploading')))
        .returning()
      if (!queued) return (await db.select().from(document).where(eq(document.id, row.id)))[0]!

      try {
        await queue.enqueue(queued.id)
      } catch (error) {
        console.error('[intake] could not enqueue extraction', error)
        return fail(queued.id, 'The Document could not be queued for extraction. Try again.')
      }
      return queued
    },
  }
}
