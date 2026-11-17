/**
 * Re-extraction (spec "Re-extraction", ADR 0005). Re-running puts the Document back in the queue
 * with an explicit Provider Connection, model and Template; the runner then creates a new
 * Extraction and makes it current. Corrected Values stay with the earlier Extraction's Invoices.
 */
import { and, asc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { document, extraction, invoice, providerConnection, template } from '../../db/schema'
import { isUuid } from '../document-library'
import type { ExtractionChoice, ExtractionQueue } from '../extraction-queue'
import { findUsableTemplate } from '../templates'

export class RerunError extends Error {}

export interface TemplateChoice {
  id: string
  name: string
  builtIn: boolean
}

export function createReextraction(deps: { db: Database; queue: ExtractionQueue }) {
  const { db, queue } = deps

  return {
    /** True when the Current Extraction's Invoices carry any Corrected Values (the UI warns before re-running). */
    async currentHasCorrections(userId: string, documentId: string): Promise<boolean> {
      if (!isUuid(documentId)) return false
      const [row] = await db
        .select({ id: invoice.id })
        .from(invoice)
        .innerJoin(extraction, eq(extraction.id, invoice.extractionId))
        .where(
          and(
            eq(invoice.userId, userId),
            eq(invoice.documentId, documentId),
            eq(extraction.isCurrent, true),
            ne(invoice.correctedValues, sql`'{}'::jsonb`),
          ),
        )
        .limit(1)
      return Boolean(row)
    },

    /** The Templates the Re-run picker offers: the User's own plus the built-in default. */
    async templateChoices(userId: string): Promise<TemplateChoice[]> {
      const rows = await db
        .select({ id: template.id, name: template.name, userId: template.userId })
        .from(template)
        .where(or(eq(template.userId, userId), isNull(template.userId)))
        .orderBy(sql`${template.userId} is not null`, asc(template.name))
      return rows.map(({ userId: owner, ...row }) => ({ ...row, builtIn: owner === null }))
    },

    /** Queues the Document for a new Extraction. Throws RerunError when it cannot be re-run. */
    async rerun(userId: string, documentId: string, choice: ExtractionChoice): Promise<void> {
      if (!isUuid(documentId)) throw new RerunError('Document not found.')
      if (choice.connectionId) {
        const [owned] = await db
          .select({ id: providerConnection.id })
          .from(providerConnection)
          .where(and(eq(providerConnection.id, choice.connectionId), eq(providerConnection.userId, userId)))
        if (!owned) throw new RerunError('Provider Connection not found.')
      }
      if (choice.templateId && !(await findUsableTemplate(db, userId, choice.templateId))) {
        throw new RerunError('Template not found.')
      }
      const queued = await db
        .update(document)
        .set({ status: 'queued', failureReason: null })
        .where(
          and(
            eq(document.id, documentId),
            eq(document.userId, userId),
            inArray(document.status, ['extracted', 'failed']),
          ),
        )
        .returning({ id: document.id })
      if (queued.length === 0) {
        const [found] = await db
          .select({ status: document.status })
          .from(document)
          .where(and(eq(document.id, documentId), eq(document.userId, userId)))
        if (!found) throw new RerunError('Document not found.')
        throw new RerunError(
          found.status === 'queued' || found.status === 'processing'
            ? 'This Document is already queued for extraction.'
            : 'This Document has not finished arriving yet.',
        )
      }
      const job: ExtractionChoice = {}
      if (choice.connectionId) job.connectionId = choice.connectionId
      if (choice.modelId) job.modelId = choice.modelId
      if (choice.templateId) job.templateId = choice.templateId
      try {
        await queue.enqueue(documentId, job)
      } catch (error) {
        // Not queued after all: put the Document back so it can be re-run again.
        await db.update(document).set({ status: 'extracted' }).where(eq(document.id, documentId))
        throw error
      }
    },

    /** Makes an earlier Extraction of the Document current again. False when there is no such Extraction. */
    async setCurrentExtraction(userId: string, documentId: string, extractionId: string): Promise<boolean> {
      if (!isUuid(documentId) || !isUuid(extractionId)) return false
      return db.transaction(async (tx) => {
        const [target] = await tx
          .select({ id: extraction.id })
          .from(extraction)
          .where(
            and(eq(extraction.id, extractionId), eq(extraction.documentId, documentId), eq(extraction.userId, userId)),
          )
        if (!target) return false
        await tx
          .update(extraction)
          .set({ isCurrent: false })
          .where(and(eq(extraction.documentId, documentId), eq(extraction.isCurrent, true)))
        await tx.update(extraction).set({ isCurrent: true }).where(eq(extraction.id, extractionId))
        return true
      })
    },
  }
}

export type Reextraction = ReturnType<typeof createReextraction>
