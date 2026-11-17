/**
 * Computes and stores Checks for Invoices (spec "Checks"). Run after each Extraction (via the
 * extraction runner's `ChecksRunner`) and after every correction (`recheckInvoice`).
 *
 * The duplicate Check spans a User's Invoices, so a change to one Invoice can flip the result of
 * others. Every recheck therefore recomputes all of the User's current Invoices and writes the
 * requested ones plus any other whose results changed. Only Invoices of Current Extractions take
 * part in duplicate matching; earlier Extractions are history.
 */
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { extraction, invoice } from '../../db/schema'
import type { ChecksRunner } from '../extraction/runner'
import type { Field } from '../template/fields'
import { mergeValues } from '../template/values'
import { duplicateKey, runChecks, type CheckResult } from './index'

interface Candidate {
  id: string
  isCurrent: boolean
  fields: Field[]
  key: string | null
  merged: Record<string, unknown>
  stored: CheckResult[] | null
}

/**
 * Recomputes Checks for the given Invoices of one User and stores them, along with any other of the
 * User's Invoices whose duplicate status changed as a result. Returns the new results per requested
 * Invoice the User owns.
 */
export async function recheckInvoices(
  db: Database,
  userId: string,
  invoiceIds: string[],
): Promise<Map<string, CheckResult[]>> {
  return db.transaction(async (tx) => {
    // Serialise per User: concurrent rechecks would otherwise write duplicate results from stale reads.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`checks:${userId}`}))`)
    const requested = new Set(invoiceIds)
    const rows = await tx
      .select({
        id: invoice.id,
        isCurrent: extraction.isCurrent,
        snapshot: extraction.templateSnapshot,
        rawValues: invoice.rawValues,
        correctedValues: invoice.correctedValues,
        checkResults: invoice.checkResults,
      })
      .from(invoice)
      .innerJoin(extraction, eq(extraction.id, invoice.extractionId))
      .where(
        and(
          eq(invoice.userId, userId),
          invoiceIds.length > 0 ? or(eq(extraction.isCurrent, true), inArray(invoice.id, invoiceIds)) : eq(extraction.isCurrent, true),
        ),
      )
      .orderBy(asc(invoice.createdAt), asc(invoice.id))

    const candidates: Candidate[] = rows.map((row) => {
      const merged = mergeValues(row.rawValues, row.correctedValues)
      const fields = row.snapshot.fields
      return {
        id: row.id,
        isCurrent: row.isCurrent,
        fields,
        key: duplicateKey(fields, merged),
        merged,
        stored: row.checkResults,
      }
    })

    const byKey = new Map<string, string[]>()
    for (const c of candidates) {
      if (c.isCurrent && c.key !== null) byKey.set(c.key, [...(byKey.get(c.key) ?? []), c.id])
    }

    const results = new Map<string, CheckResult[]>()
    for (const c of candidates) {
      const duplicates = c.key === null ? [] : (byKey.get(c.key) ?? []).filter((id) => id !== c.id)
      const fresh = runChecks({ fields: c.fields, values: c.merged, duplicates })
      if (requested.has(c.id)) results.set(c.id, fresh)
      else if (!c.isCurrent || JSON.stringify(fresh) === JSON.stringify(c.stored)) continue
      await tx.update(invoice).set({ checkResults: fresh }).where(eq(invoice.id, c.id))
    }
    return results
  })
}

/** Recomputes and stores one Invoice's Checks (call after each correction). Null if not the User's. */
export async function recheckInvoice(db: Database, userId: string, invoiceId: string): Promise<CheckResult[] | null> {
  return (await recheckInvoices(db, userId, [invoiceId])).get(invoiceId) ?? null
}

/** The extraction runner's Checks step: checks every Invoice of the new Extraction. */
export function createChecksRunner(db: Database): ChecksRunner {
  return {
    async run({ userId, extractionId }) {
      const ids = await db
        .select({ id: invoice.id })
        .from(invoice)
        .where(and(eq(invoice.userId, userId), eq(invoice.extractionId, extractionId)))
      // Even with no Invoices, a new Current Extraction can clear duplicates its predecessor caused.
      await recheckInvoices(
        db,
        userId,
        ids.map((r) => r.id),
      )
    },
  }
}
