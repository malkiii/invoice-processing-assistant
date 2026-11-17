/**
 * Review (spec "Review", ADR 0005): reading an Invoice against its Template Snapshot, recording
 * Corrected Values, and marking it Reviewed. Every call is scoped to one User; an id the User
 * does not own reads as "not found" (null).
 */
import { and, asc, count, desc, eq, gte, ilike, isNotNull, isNull, lte, ne, not, or, sql, type SQL } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { document, extraction, invoice, template } from '../../db/schema'
import { isUuid } from '../document-library'
import type { DocumentFormat } from '../document-inspection'
import type { InvoiceValues } from '../template/fields'
import type { TemplateSnapshot } from '../template/snapshot'
import type { CheckResult } from '../checks'
import { recheckInvoice } from '../checks/recheck'
import { mergeValues } from '../template/values'
import { checkStatusOf, type InvoiceCheckStatus } from './check-results'
import { applyCorrection, correctedPaths } from './values'

/** `changed`: the Template was edited since this Extraction ran; `deleted`: it no longer exists. */
export type TemplateChange = 'none' | 'changed' | 'deleted'

export interface InvoiceReview {
  id: string
  documentId: string
  documentName: string
  documentFormat: DocumentFormat | null
  extractionId: string
  /** False for Invoices of an earlier Extraction, kept as history (ADR 0005). */
  isCurrentExtraction: boolean
  position: number
  templateSnapshot: TemplateSnapshot
  templateChange: TemplateChange
  rawValues: InvoiceValues
  correctedValues: InvoiceValues
  /** Raw Values overlaid with Corrected Values (`mergeValues`): what is shown, checked and exported. */
  values: InvoiceValues
  /** Paths (`total`, `vendor.name`, `line_items[0].amount`) of Fields whose value was corrected. */
  correctedPaths: string[]
  checkResults: CheckResult[] | null
  checkStatus: InvoiceCheckStatus
  reviewedAt: Date | null
}

export interface ReviewDeps {
  db: Database
  log?: Pick<Console, 'error'>
}

export function createReview(deps: ReviewDeps) {
  const { db } = deps
  const log = deps.log ?? console

  async function getInvoice(userId: string, invoiceId: string): Promise<InvoiceReview | null> {
    if (!isUuid(invoiceId)) return null
    const [row] = await db
      .select({
        invoice,
        documentName: document.name,
        documentFormat: document.format,
        isCurrentExtraction: extraction.isCurrent,
        templateId: extraction.templateId,
        templateSnapshot: extraction.templateSnapshot,
        currentTemplateFields: template.fields,
      })
      .from(invoice)
      .innerJoin(extraction, eq(extraction.id, invoice.extractionId))
      .innerJoin(document, eq(document.id, invoice.documentId))
      .leftJoin(template, eq(template.id, extraction.templateId))
      .where(and(eq(invoice.id, invoiceId), eq(invoice.userId, userId)))
    if (!row) return null
    const { invoice: inv } = row
    const corrected = inv.correctedValues
    const checkResults = inv.checkResults ?? null
    const templateChange: TemplateChange = !row.currentTemplateFields
      ? 'deleted'
      : JSON.stringify(row.currentTemplateFields) === JSON.stringify(row.templateSnapshot.fields)
        ? 'none'
        : 'changed'
    return {
      id: inv.id,
      documentId: inv.documentId,
      documentName: row.documentName,
      documentFormat: row.documentFormat,
      extractionId: inv.extractionId,
      isCurrentExtraction: row.isCurrentExtraction,
      position: inv.position,
      templateSnapshot: row.templateSnapshot,
      templateChange,
      rawValues: inv.rawValues,
      correctedValues: corrected,
      values: mergeValues(inv.rawValues, corrected),
      correctedPaths: correctedPaths(row.templateSnapshot.fields, inv.rawValues, corrected),
      checkResults,
      checkStatus: checkStatusOf(checkResults),
      reviewedAt: inv.reviewedAt,
    }
  }

  async function runRecheck(userId: string, invoiceId: string) {
    try {
      await recheckInvoice(db, userId, invoiceId)
    } catch (error) {
      log.error('[review] re-running Checks failed', error)
    }
  }

  /** Sets (or, with `undefined`, reverts) one Field's Corrected Value. Throws FieldCorrectionError. */
  async function setCorrection(userId: string, invoiceId: string, path: string, value: unknown) {
    if (!isUuid(invoiceId)) return null
    const found = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ rawValues: invoice.rawValues, correctedValues: invoice.correctedValues, snapshot: extraction.templateSnapshot })
        .from(invoice)
        .innerJoin(extraction, eq(extraction.id, invoice.extractionId))
        .where(and(eq(invoice.id, invoiceId), eq(invoice.userId, userId)))
        .for('update', { of: invoice })
      if (!row) return false
      const next = applyCorrection(row.snapshot.fields, row.rawValues, row.correctedValues, path, value)
      await tx.update(invoice).set({ correctedValues: next }).where(eq(invoice.id, invoiceId))
      return true
    })
    if (!found) return null
    await runRecheck(userId, invoiceId)
    return getInvoice(userId, invoiceId)
  }

  const review = {
    getInvoice,

    correctField(userId: string, invoiceId: string, path: string, value: unknown) {
      return setCorrection(userId, invoiceId, path, value)
    },

    revertField(userId: string, invoiceId: string, path: string) {
      return setCorrection(userId, invoiceId, path, undefined)
    },

    /** "Mark as reviewed", and its undo. */
    async setReviewed(userId: string, invoiceId: string, reviewed: boolean) {
      if (!isUuid(invoiceId)) return null
      const updated = await db
        .update(invoice)
        .set({ reviewedAt: reviewed ? new Date() : null })
        .where(and(eq(invoice.id, invoiceId), eq(invoice.userId, userId)))
        .returning({ id: invoice.id })
      return updated.length ? getInvoice(userId, invoiceId) : null
    },

    /**
     * The next unreviewed Invoice of a Current Extraction after `afterInvoiceId` in table order
     * (Documents oldest first, then position), wrapping around. Null when none is left.
     */
    async nextUnreviewed(userId: string, afterInvoiceId?: string): Promise<string | null> {
      const ordered = db
        .select({ id: invoice.id })
        .from(invoice)
        .innerJoin(extraction, eq(extraction.id, invoice.extractionId))
        .innerJoin(document, eq(document.id, invoice.documentId))
        .orderBy(asc(document.createdAt), asc(document.id), asc(invoice.position))
        .limit(1)
      const unreviewed = and(eq(invoice.userId, userId), eq(extraction.isCurrent, true), isNull(invoice.reviewedAt))
      if (afterInvoiceId && isUuid(afterInvoiceId)) {
        const [after] = await db
          .select({ id: invoice.id })
          .from(invoice)
          .where(and(eq(invoice.id, afterInvoiceId), eq(invoice.userId, userId)))
        if (after) {
          // Compared in SQL: timestamps carry microseconds that a JS Date would drop.
          const [next] = await ordered.where(
            and(
              unreviewed,
              sql`(${document.createdAt}, ${document.id}, ${invoice.position}) > (
                select d.created_at, d.id, i.position from invoice i join document d on d.id = i.document_id
                where i.id = ${afterInvoiceId})`,
            ),
          )
          if (next) return next.id
          const [first] = await db
            .select({ id: invoice.id })
            .from(invoice)
            .innerJoin(extraction, eq(extraction.id, invoice.extractionId))
            .innerJoin(document, eq(document.id, invoice.documentId))
            .where(and(unreviewed, ne(invoice.id, afterInvoiceId)))
            .orderBy(asc(document.createdAt), asc(document.id), asc(invoice.position))
            .limit(1)
          return first?.id ?? null
        }
      }
      const [first] = await ordered.where(unreviewed)
      return first?.id ?? null
    },

    /** The Invoice table: Invoices of Current Extractions only, with merged values. */
    async listInvoices(userId: string, filter: InvoiceListFilter): Promise<InvoiceListItem[]> {
      const conditions: SQL[] = [eq(invoice.userId, userId), eq(extraction.isCurrent, true)]
      if (filter.reviewed === true) conditions.push(isNotNull(invoice.reviewedAt))
      if (filter.reviewed === false) conditions.push(isNull(invoice.reviewedAt))
      if (filter.checks === 'failing') conditions.push(hasFailedCheck)
      if (filter.checks === 'clean') conditions.push(and(isNotNull(invoice.checkResults), not(hasFailedCheck))!)
      if (filter.checks === 'unchecked') conditions.push(isNull(invoice.checkResults))
      if (filter.vendor) conditions.push(ilike(vendorName, `%${escapeLike(filter.vendor)}%`))
      if (filter.dateFrom) conditions.push(gte(issueDate, filter.dateFrom))
      if (filter.dateTo) conditions.push(lte(issueDate, filter.dateTo))
      if (filter.search) {
        const pattern = `%${escapeLike(filter.search)}%`
        conditions.push(or(ilike(vendorName, pattern), ilike(invoiceNumber, pattern), ilike(document.name, pattern))!)
      }
      const order =
        filter.order === 'needs-review'
          ? [sql`case when ${hasFailedCheck} then 0 else 1 end`, asc(invoice.createdAt), asc(invoice.position)]
          : [desc(document.createdAt), asc(document.id), asc(invoice.position)]
      const rows = await db
        .select({
          id: invoice.id,
          documentId: invoice.documentId,
          documentName: document.name,
          position: invoice.position,
          vendorName,
          invoiceNumber,
          issueDate,
          total: mergedJson(['total']),
          currency: mergedText(['currency']),
          correctedValues: invoice.correctedValues,
          checkResults: invoice.checkResults,
          reviewedAt: invoice.reviewedAt,
        })
        .from(invoice)
        .innerJoin(extraction, eq(extraction.id, invoice.extractionId))
        .innerJoin(document, eq(document.id, invoice.documentId))
        .where(and(...conditions))
        .orderBy(...order)
        .limit(Math.min(filter.limit ?? 200, 500))
      return rows.map(({ correctedValues, checkResults: stored, total, ...row }) => {
        const checkResults = stored ?? null
        return {
          ...row,
          total: typeof total === 'number' ? total : null,
          corrected: Object.keys(correctedValues).length > 0,
          checkStatus: checkStatusOf(checkResults),
          failedChecks: (checkResults ?? []).filter((r) => r.status === 'fail').map((r) => r.message),
        }
      })
    },

    /** The dashboard's Needs review queue (failing first) and the User's usage and cost totals. */
    async dashboard(userId: string): Promise<DashboardSummary> {
      const [needsReview, [pending], [usage]] = await Promise.all([
        review.listInvoices(userId, { reviewed: false, order: 'needs-review', limit: 8 }),
        db
          .select({ n: count() })
          .from(invoice)
          .innerJoin(extraction, eq(extraction.id, invoice.extractionId))
          .where(and(eq(invoice.userId, userId), eq(extraction.isCurrent, true), isNull(invoice.reviewedAt))),
        db
          .select({
            extractions: count(),
            inputTokens: sql<string | null>`sum(${extraction.inputTokens})`,
            outputTokens: sql<string | null>`sum(${extraction.outputTokens})`,
            estimatedCost: sql<number | null>`sum(${extraction.estimatedCost})`,
          })
          .from(extraction)
          .where(eq(extraction.userId, userId)),
      ])
      return {
        needsReview,
        needsReviewCount: pending?.n ?? 0,
        usage: {
          extractions: usage?.extractions ?? 0,
          inputTokens: Number(usage?.inputTokens ?? 0),
          outputTokens: Number(usage?.outputTokens ?? 0),
          // Rounded to hide float noise from summing doubles.
          estimatedCost: usage?.estimatedCost == null ? null : Math.round(Number(usage.estimatedCost) * 1e6) / 1e6,
        },
      }
    },
  }
  return review
}

export interface DashboardSummary {
  needsReview: InvoiceListItem[]
  needsReviewCount: number
  usage: { extractions: number; inputTokens: number; outputTokens: number; estimatedCost: number | null }
}

export interface InvoiceListFilter {
  /** Matches vendor name, invoice number or Document name. */
  search?: string
  reviewed?: boolean
  checks?: InvoiceCheckStatus
  vendor?: string
  /** Issue date bounds, inclusive, `YYYY-MM-DD`. */
  dateFrom?: string
  dateTo?: string
  /** `recent`: newest Documents first. `needs-review`: failing Checks first, then oldest. */
  order?: 'recent' | 'needs-review'
  limit?: number
}

export interface InvoiceListItem {
  id: string
  documentId: string
  documentName: string
  position: number
  vendorName: string | null
  invoiceNumber: string | null
  issueDate: string | null
  total: number | null
  currency: string | null
  reviewedAt: Date | null
  corrected: boolean
  checkStatus: InvoiceCheckStatus
  failedChecks: string[]
}

/**
 * A merged (Raw overlaid with Corrected) value read in SQL, for filtering and listing. These
 * use the built-in default Template's keys; Invoices of custom Templates without them show blanks.
 */
function mergedJson(path: string[]) {
  const pgPath = `{${path.join(',')}}`
  return sql<unknown>`coalesce(${invoice.correctedValues} #> ${pgPath}::text[], ${invoice.rawValues} #> ${pgPath}::text[])`
}

function mergedText(path: string[]) {
  return sql<string | null>`(${mergedJson(path)} #>> '{}')`
}

const vendorName = mergedText(['vendor', 'name'])
const invoiceNumber = mergedText(['invoice_number'])
const issueDate = mergedText(['issue_date'])
const hasFailedCheck = sql`coalesce(${invoice.checkResults} @> '[{"status":"fail"}]'::jsonb, false)`

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export type Review = ReturnType<typeof createReview>
