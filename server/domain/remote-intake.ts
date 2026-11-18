/**
 * The worker step shared by every intake where the server downloads the file itself (URL intake,
 * Google Drive and Dropbox): download a `fetching` Document, check it like an upload, store it
 * and queue it for extraction, or mark it `failed` with the reason.
 */
import { and, eq } from 'drizzle-orm'
import type { Database } from '../db/client'
import { getInstanceSettings } from '../db/instance-settings'
import { document } from '../db/schema'
import { inspectDocument, type DocumentLimits } from './document-inspection'
import type { DocumentRow } from './document-library'
import type { ExtractionQueue } from './extraction-queue'
import type { ObjectStorage } from './storage'
import { storageKeyFor } from './storage-keys'

export type RemoteDownload = { ok: true; bytes: Uint8Array } | { ok: false; reason: string }

export interface RemoteIntakeDeps {
  db: Database
  storage: ObjectStorage
  extractionQueue: ExtractionQueue
}

export async function failDocument(
  db: Database,
  documentId: string,
  reason: string,
  extra: Partial<DocumentRow> = {},
): Promise<DocumentRow> {
  const [row] = await db
    .update(document)
    .set({ ...extra, status: 'failed', failureReason: reason })
    .where(eq(document.id, documentId))
    .returning()
  return row!
}

/**
 * Any status other than `fetching` is left unchanged (a retried job); null when the Document no
 * longer exists (deleted while waiting). `download` is only called for a `fetching` Document.
 */
export async function fetchRemoteDocument(
  deps: RemoteIntakeDeps,
  documentId: string,
  download: (row: DocumentRow, limits: DocumentLimits) => Promise<RemoteDownload>,
): Promise<DocumentRow | null> {
  const { db, storage, extractionQueue } = deps
  const [row] = await db.select().from(document).where(eq(document.id, documentId))
  if (!row) return null
  if (row.status !== 'fetching') return row

  const settings = await getInstanceSettings(db)
  const limits = { maxDocumentBytes: settings.maxDocumentBytes, maxDocumentPages: settings.maxDocumentPages }
  const fetched = await download(row, limits)
  if (!fetched.ok) return failDocument(db, row.id, fetched.reason)

  const sizeBytes = fetched.bytes.length
  const result = await inspectDocument(fetched.bytes, limits)
  if (!result.ok) return failDocument(db, row.id, result.reason, { sizeBytes })

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
    console.error('[intake] could not enqueue extraction', error)
    return failDocument(db, queued.id, 'The Document could not be queued for extraction. Try again.')
  }
  return queued
}
