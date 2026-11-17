/**
 * Exports (spec "Export"): a User asks for a file of some Invoices; small Exports are generated
 * while they wait, larger ones by the worker. Every Export is stored in object storage and listed
 * in the Export history drawer. Values are always Raw overlaid with Corrected, and only
 * Invoices of Current Extractions are exported.
 */
import { and, asc, count, desc, eq, inArray, isNotNull, type SQL } from 'drizzle-orm'
import type { PgBoss } from 'pg-boss'
import type { Database } from '../../db/client'
import { batch, document, exportFile, extraction, invoice } from '../../db/schema'
import { isUuid } from '../document-library'
import { invoiceListConditions, type InvoiceListFilter } from '../review/review'
import type { ObjectStorage } from '../storage'
import { exportStorageKey } from '../storage-keys'
import { mergeValues } from '../template/values'
import type { ExportInvoice } from './flatten'
import { renderExport, type CsvLayout, type ExportFormat } from './render'

/** Which Invoices an Export covers. A filter is the Invoice table's filter. */
export type ExportScope =
  | { kind: 'invoice'; invoiceId: string }
  | { kind: 'selection'; invoiceIds: string[] }
  | { kind: 'batch'; batchId: string }
  | { kind: 'filter'; filter: Omit<InvoiceListFilter, 'order' | 'limit'> }

export type ExportStatus = 'pending' | 'ready' | 'failed'

export interface ExportRequest {
  format: ExportFormat
  /** CSV only; defaults to one row per line item. */
  csvLayout?: CsvLayout
  scope: ExportScope
  reviewedOnly?: boolean
}

export interface ExportSummary {
  id: string
  format: ExportFormat
  csvLayout: CsvLayout | null
  scope: ExportScope
  reviewedOnly: boolean
  status: ExportStatus
  invoiceCount: number
  fileName: string | null
  sizeBytes: number | null
  failureReason: string | null
  createdAt: Date
  completedAt: Date | null
}

/** Shown to the User as is. */
export class ExportError extends Error {}

/** pg-boss queue holding one job per Export too large to generate in the request. */
export const GENERATE_EXPORT_QUEUE = 'generate-export'

export interface GenerateExportJob {
  exportId: string
}

export interface ExportQueue {
  enqueue(exportId: string): Promise<void>
}

export async function createExportQueue(boss: PgBoss): Promise<ExportQueue> {
  await boss.createQueue(GENERATE_EXPORT_QUEUE)
  return {
    async enqueue(exportId) {
      await boss.send(GENERATE_EXPORT_QUEUE, { exportId } satisfies GenerateExportJob)
    },
  }
}

/** Exports of at most this many Invoices are generated in the request. */
export const DEFAULT_INLINE_LIMIT = 500
/** The most Invoices one selection may name. */
export const MAX_SELECTION = 5000
const HISTORY_LIMIT = 30

export interface ExportsDeps {
  db: Database
  storage: ObjectStorage
  queue: ExportQueue
  inlineLimit?: number
  log?: Pick<Console, 'error'>
}

function fileNameFor(extension: string, at: Date): string {
  const stamp = at.toISOString().slice(0, 16).replace('T', '-').replace(':', '')
  return `invoices-${stamp}.${extension}`
}

function summary(row: typeof exportFile.$inferSelect): ExportSummary {
  return {
    id: row.id,
    format: row.format,
    csvLayout: row.csvLayout,
    scope: row.scope,
    reviewedOnly: row.reviewedOnly,
    status: row.status,
    invoiceCount: row.invoiceCount,
    fileName: row.fileName,
    sizeBytes: row.sizeBytes,
    failureReason: row.failureReason,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  }
}

/** SQL selecting the User's exportable Invoices in scope; null when the scope can match nothing. */
function scopeConditions(userId: string, scope: ExportScope, reviewedOnly: boolean): SQL | null {
  let inScope: SQL
  switch (scope.kind) {
    case 'invoice':
      if (!isUuid(scope.invoiceId)) return null
      inScope = eq(invoice.id, scope.invoiceId)
      break
    case 'selection': {
      const ids = scope.invoiceIds.filter(isUuid)
      if (ids.length === 0) return null
      inScope = inArray(invoice.id, ids)
      break
    }
    case 'batch':
      if (!isUuid(scope.batchId)) return null
      inScope = eq(document.batchId, scope.batchId)
      break
    case 'filter':
      inScope = invoiceListConditions(userId, scope.filter)
      break
  }
  return and(
    eq(invoice.userId, userId),
    eq(extraction.isCurrent, true),
    inScope,
    reviewedOnly ? isNotNull(invoice.reviewedAt) : undefined,
  )!
}

export function createExports(deps: ExportsDeps) {
  const { db, storage, queue } = deps
  const inlineLimit = deps.inlineLimit ?? DEFAULT_INLINE_LIMIT
  const log = deps.log ?? console

  async function countInScope(where: SQL): Promise<number> {
    const [row] = await db
      .select({ n: count() })
      .from(invoice)
      .innerJoin(extraction, eq(extraction.id, invoice.extractionId))
      .innerJoin(document, eq(document.id, invoice.documentId))
      .where(where)
    return row?.n ?? 0
  }

  async function invoicesInScope(where: SQL): Promise<ExportInvoice[]> {
    const rows = await db
      .select({
        id: invoice.id,
        documentId: invoice.documentId,
        documentName: document.name,
        position: invoice.position,
        rawValues: invoice.rawValues,
        correctedValues: invoice.correctedValues,
        reviewedAt: invoice.reviewedAt,
        snapshot: extraction.templateSnapshot,
      })
      .from(invoice)
      .innerJoin(extraction, eq(extraction.id, invoice.extractionId))
      .innerJoin(document, eq(document.id, invoice.documentId))
      .where(where)
      .orderBy(asc(document.createdAt), asc(document.id), asc(invoice.position))
    return rows.map((r) => ({
      id: r.id,
      documentId: r.documentId,
      documentName: r.documentName,
      position: r.position,
      templateName: r.snapshot.name,
      fields: r.snapshot.fields,
      values: mergeValues(r.rawValues, r.correctedValues),
      reviewedAt: r.reviewedAt,
    }))
  }

  /** Renders and stores the file of a pending Export. Failures are recorded on the Export, not thrown. */
  async function generate(exportId: string): Promise<void> {
    const [row] = await db.select().from(exportFile).where(eq(exportFile.id, exportId))
    if (!row || row.status !== 'pending') return
    try {
      const where = scopeConditions(row.userId, row.scope, row.reviewedOnly)
      const invoices = where ? await invoicesInScope(where) : []
      if (invoices.length === 0) throw new ExportError('None of these Invoices exist any more.')
      const file = await renderExport(invoices, { format: row.format, csvLayout: row.csvLayout ?? undefined })
      const key = exportStorageKey(row.userId, row.id)
      await storage.write(key, file.bytes, file.contentType)
      const updated = await db
        .update(exportFile)
        .set({
          status: 'ready',
          invoiceCount: invoices.length,
          fileName: fileNameFor(file.extension, row.createdAt),
          storageKey: key,
          contentType: file.contentType,
          sizeBytes: file.bytes.byteLength,
          completedAt: new Date(),
        })
        .where(eq(exportFile.id, row.id))
        .returning({ id: exportFile.id })
      // Deleted by the User while it was being generated: drop the file nobody can reach.
      if (updated.length === 0) await storage.delete(key)
    } catch (error) {
      if (!(error instanceof ExportError)) log.error('[exports] generating export failed', error)
      await db
        .update(exportFile)
        .set({
          status: 'failed',
          failureReason: error instanceof ExportError ? error.message : 'The file could not be generated.',
          completedAt: new Date(),
        })
        .where(eq(exportFile.id, row.id))
    }
  }

  async function get(userId: string, exportId: string) {
    if (!isUuid(exportId)) return null
    const [row] = await db
      .select()
      .from(exportFile)
      .where(and(eq(exportFile.id, exportId), eq(exportFile.userId, userId)))
    return row ?? null
  }

  return {
    /** Records an Export and generates it now, or queues it when large. Throws ExportError. */
    async request(userId: string, request: ExportRequest): Promise<ExportSummary> {
      if (request.scope.kind === 'selection' && request.scope.invoiceIds.length > MAX_SELECTION) {
        throw new ExportError(`Select at most ${MAX_SELECTION} Invoices, or export a filter instead.`)
      }
      if (request.scope.kind === 'batch') {
        const [owned] = isUuid(request.scope.batchId)
          ? await db
              .select({ id: batch.id })
              .from(batch)
              .where(and(eq(batch.id, request.scope.batchId), eq(batch.userId, userId)))
          : []
        if (!owned) throw new ExportError('Batch not found.')
      }
      const reviewedOnly = request.reviewedOnly ?? false
      const where = scopeConditions(userId, request.scope, reviewedOnly)
      const invoiceCount = where ? await countInScope(where) : 0
      if (invoiceCount === 0) {
        throw new ExportError(reviewedOnly ? 'No Reviewed Invoices to export.' : 'No Invoices to export.')
      }
      const [row] = await db
        .insert(exportFile)
        .values({
          userId,
          format: request.format,
          csvLayout: request.format === 'csv' ? (request.csvLayout ?? 'rows') : null,
          scope: request.scope,
          reviewedOnly,
          status: 'pending',
          invoiceCount,
        })
        .returning()
      if (invoiceCount > inlineLimit) {
        await queue.enqueue(row!.id)
        return summary(row!)
      }
      await generate(row!.id)
      return summary((await get(userId, row!.id))!)
    },

    generate,

    /** The Export history, newest first. */
    async list(userId: string): Promise<ExportSummary[]> {
      const rows = await db
        .select()
        .from(exportFile)
        .where(eq(exportFile.userId, userId))
        .orderBy(desc(exportFile.createdAt))
        .limit(HISTORY_LIMIT)
      return rows.map(summary)
    },

    /** A short-lived URL that downloads a ready Export; null when not found or not ready. */
    async downloadUrl(userId: string, exportId: string): Promise<string | null> {
      const row = await get(userId, exportId)
      if (!row || row.status !== 'ready' || !row.storageKey) return null
      return storage.presignDownload(row.storageKey, {
        contentType: row.contentType ?? 'application/octet-stream',
        fileName: row.fileName ?? 'export',
        disposition: 'attachment',
      })
    },

    /** Removes an Export from the history and deletes its file. */
    async remove(userId: string, exportId: string): Promise<boolean> {
      const row = await get(userId, exportId)
      if (!row) return false
      await db.delete(exportFile).where(eq(exportFile.id, row.id))
      await storage.delete(exportStorageKey(userId, row.id))
      return true
    },
  }
}

export type Exports = ReturnType<typeof createExports>
