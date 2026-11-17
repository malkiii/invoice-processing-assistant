import { and, count, desc, eq } from 'drizzle-orm'
import type { Database } from '../db/client'
import { batch, document } from '../db/schema'
import type { DocumentStatus } from './documents'
import type { ObjectStorage } from './storage'

export type DocumentRow = typeof document.$inferSelect
export type BatchRow = typeof batch.$inferSelect

export interface BatchSummary extends BatchRow {
  documentCount: number
  statusCounts: Partial<Record<DocumentStatus, number>>
}

/** Reading and deleting a User's Batches and Documents. Every call is scoped to one User. */
export interface DocumentLibrary {
  listBatches(userId: string): Promise<BatchSummary[]>
  getBatch(userId: string, batchId: string): Promise<(BatchRow & { documents: DocumentRow[] }) | null>
  listDocuments(userId: string): Promise<DocumentRow[]>
  getDocument(userId: string, documentId: string): Promise<DocumentRow | null>
  /** A short-lived URL to view the Document's file, or null when it has no viewable file. */
  fileUrl(userId: string, documentId: string): Promise<string | null>
  /** Deletes the Document and its stored file. Returns false when the User has no such Document. */
  deleteDocument(userId: string, documentId: string): Promise<boolean>
}

export function createDocumentLibrary(deps: { db: Database; storage: ObjectStorage }): DocumentLibrary {
  const { db, storage } = deps

  async function getDocument(userId: string, documentId: string) {
    if (!isUuid(documentId)) return null
    const [row] = await db
      .select()
      .from(document)
      .where(and(eq(document.id, documentId), eq(document.userId, userId)))
    return row ?? null
  }

  return {
    async listBatches(userId) {
      const batches = await db
        .select()
        .from(batch)
        .where(eq(batch.userId, userId))
        .orderBy(desc(batch.createdAt))
        .limit(200)
      if (batches.length === 0) return []
      const counts = await db
        .select({ batchId: document.batchId, status: document.status, n: count() })
        .from(document)
        .where(eq(document.userId, userId))
        .groupBy(document.batchId, document.status)
      return batches.map((b) => {
        const statusCounts: BatchSummary['statusCounts'] = {}
        for (const c of counts) if (c.batchId === b.id) statusCounts[c.status] = c.n
        const documentCount = Object.values(statusCounts).reduce((a, n) => a + n, 0)
        return { ...b, documentCount, statusCounts }
      })
    },

    async getBatch(userId, batchId) {
      if (!isUuid(batchId)) return null
      const [row] = await db
        .select()
        .from(batch)
        .where(and(eq(batch.id, batchId), eq(batch.userId, userId)))
      if (!row) return null
      const documents = await db
        .select()
        .from(document)
        .where(eq(document.batchId, batchId))
        .orderBy(document.name)
      return { ...row, documents }
    },

    listDocuments(userId) {
      return db
        .select()
        .from(document)
        .where(eq(document.userId, userId))
        .orderBy(desc(document.createdAt), document.name)
        .limit(500)
    },

    getDocument,

    async fileUrl(userId, documentId) {
      const row = await getDocument(userId, documentId)
      if (!row?.storageKey || !row.mimeType) return null
      return storage.presignDownload(row.storageKey, { contentType: row.mimeType, fileName: row.name })
    },

    async deleteDocument(userId, documentId) {
      const row = await getDocument(userId, documentId)
      if (!row) return false
      // File first: a left-over row is visible and can be deleted again; a left-over file is not.
      if (row.storageKey) await storage.delete(row.storageKey)
      await db.delete(document).where(eq(document.id, row.id))
      return true
    },
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Ids come from URLs; anything that is not a uuid cannot match and must not reach Postgres. */
export function isUuid(id: string): boolean {
  return UUID.test(id)
}
