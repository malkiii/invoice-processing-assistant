import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { batch, document, extraction, invoice, user } from '../../server/db/schema'
import {
  createReview,
  type InvoiceListFilter,
  type InvoiceRechecker,
  type Review,
} from '../../server/domain/review/review'
import { FieldCorrectionError } from '../../server/domain/review/values'
import { DEFAULT_TEMPLATE, DEFAULT_TEMPLATE_ID } from '../../server/domain/template/default-template'
import { snapshotTemplate } from '../../server/domain/template/snapshot'
import { startTestDatabase, type TestDatabase } from './support/database'

let testDb: TestDatabase
let review: Review
const recheck: InvoiceRechecker = { recheck: vi.fn(async () => {}) }

const alice = 'user-alice'
const bob = 'user-bob'

const rawA = {
  vendor: { name: 'Acme GmbH', address: null, tax_id: 'DE1' },
  invoice_number: 'INV-1001',
  issue_date: '2026-03-01',
  currency: 'EUR',
  line_items: [{ description: 'Consulting', quantity: 2, unit_price: 500, amount: 1000, tax_rate: 19 }],
  total: 1190,
}

beforeAll(async () => {
  testDb = await startTestDatabase()
  await testDb.db.insert(user).values([
    { id: alice, name: 'Alice', email: 'alice@example.com' },
    { id: bob, name: 'Bob', email: 'bob@example.com' },
  ])
  review = createReview({ db: testDb.db, recheck })
})

afterAll(async () => {
  await testDb?.stop()
})

beforeEach(() => {
  vi.mocked(recheck.recheck).mockClear()
})

/** A Document with one Current Extraction holding the given Invoices' Raw Values. */
async function extractedDocument(
  invoices: Record<string, unknown>[],
  opts: { userId?: string; name?: string; checkResults?: unknown[] | null } = {},
) {
  const userId = opts.userId ?? alice
  const [b] = await testDb.db.insert(batch).values({ userId, source: 'upload' }).returning()
  const [doc] = await testDb.db
    .insert(document)
    .values({ userId, batchId: b!.id, source: 'upload', name: opts.name ?? 'invoice.pdf', status: 'extracted', format: 'pdf' })
    .returning()
  const [ex] = await testDb.db
    .insert(extraction)
    .values({
      documentId: doc!.id,
      userId,
      isCurrent: true,
      providerKind: 'openai',
      modelId: 'gpt-4.1-mini',
      templateId: DEFAULT_TEMPLATE_ID,
      templateSnapshot: snapshotTemplate({ id: DEFAULT_TEMPLATE_ID, ...DEFAULT_TEMPLATE }),
      inputTokens: 1000,
      outputTokens: 200,
      durationMs: 1500,
      estimatedCost: 0.01,
    })
    .returning()
  const rows = await testDb.db
    .insert(invoice)
    .values(
      invoices.map((rawValues, position) => ({
        extractionId: ex!.id,
        documentId: doc!.id,
        userId,
        position,
        rawValues,
        checkResults: opts.checkResults ?? null,
      })),
    )
    .returning()
  return { document: doc!, extraction: ex!, invoices: rows }
}

describe('Review: Corrected Values', () => {
  it('shows a corrected Field while keeping the Raw Value', async () => {
    const { invoices } = await extractedDocument([rawA])
    const id = invoices[0]!.id

    const updated = await review.correctField(alice, id, 'vendor.name', 'ACME GmbH & Co. KG')

    expect(updated!.values.vendor).toEqual({ name: 'ACME GmbH & Co. KG', address: null, tax_id: 'DE1' })
    expect(updated!.rawValues).toEqual(rawA)
    expect(updated!.correctedPaths).toEqual(['vendor.name'])
    const reread = await review.getInvoice(alice, id)
    expect(reread!.values.vendor).toMatchObject({ name: 'ACME GmbH & Co. KG' })
    expect(reread!.rawValues).toEqual(rawA)
  })

  it('reverts a corrected Field to its Raw Value', async () => {
    const { invoices } = await extractedDocument([rawA])
    const id = invoices[0]!.id
    await review.correctField(alice, id, 'total', 1200)
    await review.correctField(alice, id, 'line_items.0.amount', 1010)

    const reverted = await review.revertField(alice, id, 'total')

    expect(reverted!.values.total).toBe(1190)
    expect(reverted!.correctedPaths).toEqual(['line_items.0.amount'])
  })

  it('re-runs Checks after every correction and revert', async () => {
    const { invoices } = await extractedDocument([rawA])
    const id = invoices[0]!.id
    await review.correctField(alice, id, 'total', 1200)
    await review.revertField(alice, id, 'total')
    expect(recheck.recheck).toHaveBeenCalledTimes(2)
    expect(recheck.recheck).toHaveBeenCalledWith({ userId: alice, invoiceId: id })
  })

  it('rejects a value that does not fit the Template Snapshot', async () => {
    const { invoices } = await extractedDocument([rawA])
    await expect(review.correctField(alice, invoices[0]!.id, 'total', 'lots')).rejects.toThrow(FieldCorrectionError)
  })

  it('does not let one User see or correct another User’s Invoice', async () => {
    const { invoices } = await extractedDocument([rawA], { userId: bob })
    expect(await review.getInvoice(alice, invoices[0]!.id)).toBeNull()
    expect(await review.correctField(alice, invoices[0]!.id, 'total', 1)).toBeNull()
    expect(await review.getInvoice(alice, 'not-a-uuid')).toBeNull()
  })
})

describe('Review: Reviewed state', () => {
  it('marks an Invoice as reviewed and undoes it', async () => {
    const { invoices } = await extractedDocument([rawA])
    const id = invoices[0]!.id
    expect((await review.getInvoice(alice, id))!.reviewedAt).toBeNull()

    expect((await review.setReviewed(alice, id, true))!.reviewedAt).toBeInstanceOf(Date)
    expect((await review.setReviewed(alice, id, false))!.reviewedAt).toBeNull()
  })

  it('finds the next unreviewed Invoice of a Current Extraction, wrapping around', async () => {
    const userId = 'user-next'
    await testDb.db.insert(user).values({ id: userId, name: 'N', email: 'next@example.com' })
    const first = await extractedDocument([rawA, rawA], { userId })
    const second = await extractedDocument([rawA], { userId })
    const [a, b] = first.invoices
    const c = second.invoices[0]!
    await review.setReviewed(userId, b!.id, true)

    expect(await review.nextUnreviewed(userId, a!.id)).toBe(c.id)
    expect(await review.nextUnreviewed(userId, c.id)).toBe(a!.id)
    await review.setReviewed(userId, a!.id, true)
    await review.setReviewed(userId, c.id, true)
    expect(await review.nextUnreviewed(userId, c.id)).toBeNull()
  })
})

describe('Review: Template Snapshot', () => {
  it('hints when the Template changed since the Extraction ran', async () => {
    const { invoices, extraction: ex } = await extractedDocument([rawA])
    expect((await review.getInvoice(alice, invoices[0]!.id))!.templateChange).toBe('none')
    await testDb.db
      .update(extraction)
      .set({ templateSnapshot: { templateId: DEFAULT_TEMPLATE_ID, name: 'Old', fields: DEFAULT_TEMPLATE.fields.slice(1) } })
      .where(eq(extraction.id, ex.id))
    const changed = await review.getInvoice(alice, invoices[0]!.id)
    expect(changed!.templateChange).toBe('changed')
    expect(changed!.templateSnapshot.fields).toHaveLength(DEFAULT_TEMPLATE.fields.length - 1)
  })
})

describe('Invoice table', () => {
  const fail = { id: 'totals', status: 'fail', message: 'Line items do not add up to the subtotal', fields: ['total'] }
  const pass = { id: 'dates', status: 'pass', message: 'Dates are valid', fields: ['issue_date'] }
  const userId = 'user-table'
  let ids: Record<string, string>

  beforeAll(async () => {
    await testDb.db.insert(user).values({ id: userId, name: 'T', email: 'table@example.com' })
    const clean = await extractedDocument(
      [{ ...rawA, vendor: { name: 'Initech' }, invoice_number: 'IT-1', issue_date: '2026-01-15' }],
      { userId, name: 'initech.pdf', checkResults: [pass] },
    )
    const failing = await extractedDocument([{ ...rawA, invoice_number: 'AC-7', issue_date: '2026-02-10' }], {
      userId,
      name: 'acme.pdf',
      checkResults: [pass, fail],
    })
    const unchecked = await extractedDocument([{ ...rawA, vendor: { name: 'Globex' }, invoice_number: 'GX-3' }], {
      userId,
      name: 'globex.pdf',
    })
    ids = { clean: clean.invoices[0]!.id, failing: failing.invoices[0]!.id, unchecked: unchecked.invoices[0]!.id }
    await review.setReviewed(userId, ids.clean!, true)
  })

  it('lists Current Invoices with merged values, Check status and failed Checks', async () => {
    await review.correctField(userId, ids.unchecked!, 'vendor.name', 'Globex Corp')
    const rows = await review.listInvoices(userId, {})
    expect(rows).toHaveLength(3)
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
    expect(byId[ids.unchecked!]).toMatchObject({ vendorName: 'Globex Corp', corrected: true, checkStatus: 'unchecked' })
    expect(byId[ids.failing!]).toMatchObject({
      vendorName: 'Acme GmbH',
      invoiceNumber: 'AC-7',
      documentName: 'acme.pdf',
      total: 1190,
      currency: 'EUR',
      checkStatus: 'failing',
      failedChecks: ['Line items do not add up to the subtotal'],
    })
    expect(byId[ids.clean!]).toMatchObject({ checkStatus: 'clean', failedChecks: [] })
    expect(byId[ids.clean!]!.reviewedAt).toBeInstanceOf(Date)
  })

  it('filters by Reviewed, Check status, vendor, date and free-text search', async () => {
    const idsOf = async (filter: InvoiceListFilter) => (await review.listInvoices(userId, filter)).map((r) => r.id).sort()

    expect(await idsOf({ reviewed: true })).toEqual([ids.clean])
    expect(await idsOf({ reviewed: false })).toEqual([ids.failing, ids.unchecked].sort())
    expect(await idsOf({ checks: 'failing' })).toEqual([ids.failing])
    expect(await idsOf({ checks: 'clean' })).toEqual([ids.clean])
    expect(await idsOf({ checks: 'unchecked' })).toEqual([ids.unchecked])
    expect(await idsOf({ vendor: 'acme' })).toEqual([ids.failing])
    expect(await idsOf({ dateFrom: '2026-02-01', dateTo: '2026-02-28' })).toEqual([ids.failing])
    expect(await idsOf({ search: 'IT-1' })).toEqual([ids.clean])
    expect(await idsOf({ search: 'globex.pdf' })).toEqual([ids.unchecked])
  })

  it('summarises the dashboard: Needs review queue and usage and cost totals', async () => {
    const summary = await review.dashboard(userId)
    expect(summary.needsReviewCount).toBe(2)
    expect(summary.needsReview.map((r) => r.id)).toEqual([ids.failing, ids.unchecked])
    expect(summary.usage).toEqual({ extractions: 3, inputTokens: 3000, outputTokens: 600, estimatedCost: 0.03 })
  })

  it('orders the Needs review queue with failing Invoices first', async () => {
    const queue = await review.listInvoices(userId, { reviewed: false, order: 'needs-review' })
    expect(queue.map((r) => r.id)).toEqual([ids.failing, ids.unchecked])
  })
})
