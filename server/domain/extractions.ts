/** Reading a User's Extractions and their Invoices. Every call is scoped to one User. */
import { and, asc, count, desc, eq } from 'drizzle-orm'
import type { Database } from '../db/client'
import { extraction, invoice } from '../db/schema'
import type { ProviderKind } from './provider-presets'
import type { InvoiceValues } from './template/fields'
import type { TemplateSnapshot } from './template/snapshot'

export interface ExtractionSummary {
  id: string
  documentId: string
  isCurrent: boolean
  connectionId: string | null
  providerKind: ProviderKind
  modelId: string
  templateId: string | null
  templateName: string
  templateSnapshot: TemplateSnapshot
  inputTokens: number
  outputTokens: number
  durationMs: number
  estimatedCost: number | null
  invoiceCount: number
  createdAt: Date
}

export interface InvoiceRecord {
  id: string
  extractionId: string
  documentId: string
  position: number
  rawValues: InvoiceValues
  correctedValues: InvoiceValues
  checkResults: unknown
  reviewedAt: Date | null
}

/** A Document's Extraction history, newest first. */
export async function listExtractions(db: Database, userId: string, documentId: string): Promise<ExtractionSummary[]> {
  const rows = await db
    .select({
      id: extraction.id,
      documentId: extraction.documentId,
      isCurrent: extraction.isCurrent,
      connectionId: extraction.connectionId,
      providerKind: extraction.providerKind,
      modelId: extraction.modelId,
      templateId: extraction.templateId,
      templateSnapshot: extraction.templateSnapshot,
      inputTokens: extraction.inputTokens,
      outputTokens: extraction.outputTokens,
      durationMs: extraction.durationMs,
      estimatedCost: extraction.estimatedCost,
      createdAt: extraction.createdAt,
      invoiceCount: count(invoice.id),
    })
    .from(extraction)
    .leftJoin(invoice, eq(invoice.extractionId, extraction.id))
    .where(and(eq(extraction.userId, userId), eq(extraction.documentId, documentId)))
    .groupBy(extraction.id)
    .orderBy(desc(extraction.createdAt), desc(extraction.id))
  return rows.map((row) => ({ ...row, templateName: row.templateSnapshot.name }))
}

/** An Extraction's Invoices in Document order. */
export async function listInvoices(db: Database, userId: string, extractionId: string): Promise<InvoiceRecord[]> {
  return db
    .select({
      id: invoice.id,
      extractionId: invoice.extractionId,
      documentId: invoice.documentId,
      position: invoice.position,
      rawValues: invoice.rawValues,
      correctedValues: invoice.correctedValues,
      checkResults: invoice.checkResults,
      reviewedAt: invoice.reviewedAt,
    })
    .from(invoice)
    .where(and(eq(invoice.userId, userId), eq(invoice.extractionId, extractionId)))
    .orderBy(asc(invoice.position))
}
