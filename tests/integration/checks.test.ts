import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { batch, document, extraction, invoice, user } from '../../server/db/schema'
import { createChecksRunner, recheckInvoice } from '../../server/domain/checks/recheck'
import type { CheckId, CheckResult } from '../../server/domain/checks'
import { listInvoices } from '../../server/domain/extractions'
import { DEFAULT_TEMPLATE } from '../../server/domain/template/default-template'
import type { Field, InvoiceValues } from '../../server/domain/template/fields'
import { snapshotTemplate } from '../../server/domain/template/snapshot'
import { startTestDatabase, type TestDatabase } from './support/database'

let testDb: TestDatabase
const alice = 'user-alice'
const bob = 'user-bob'

beforeAll(async () => {
  testDb = await startTestDatabase()
  await testDb.db.insert(user).values([
    { id: alice, name: 'Alice', email: 'alice@example.com' },
    { id: bob, name: 'Bob', email: 'bob@example.com' },
  ])
})

afterAll(async () => {
  await testDb?.stop()
})

let counter = 0
/** A distinct, internally consistent Invoice; override fields per test. */
function invoiceValues(overrides: InvoiceValues = {}): InvoiceValues {
  counter += 1
  return {
    vendor: { name: 'Acme GmbH', address: null, tax_id: null },
    buyer: { name: 'Globex Ltd', address: null, tax_id: null },
    invoice_number: `INV-${counter}`,
    issue_date: '2026-03-01',
    due_date: '2026-03-31',
    currency: 'EUR',
    line_items: [{ description: 'Consulting', quantity: 1, unit_price: 100, amount: 100, tax_rate: 19 }],
    subtotal: 100,
    tax_total: 19,
    total: 119,
    payment_terms: null,
    ...overrides,
  }
}

async function newDocument(userId = alice) {
  const [b] = await testDb.db.insert(batch).values({ userId, source: 'upload' }).returning()
  const [doc] = await testDb.db
    .insert(document)
    .values({ userId, batchId: b!.id, source: 'upload', name: 'invoice.pdf', status: 'processing' })
    .returning()
  return doc!
}

/** Persists an Extraction as the runner does: it becomes the Document's Current Extraction. */
async function extract(
  documentId: string,
  invoices: InvoiceValues[],
  opts: { userId?: string; fields?: Field[] } = {},
) {
  const userId = opts.userId ?? alice
  await testDb.db
    .update(extraction)
    .set({ isCurrent: false })
    .where(and(eq(extraction.documentId, documentId), eq(extraction.isCurrent, true)))
  const [created] = await testDb.db
    .insert(extraction)
    .values({
      documentId,
      userId,
      isCurrent: true,
      providerKind: 'openai',
      modelId: 'gpt-4.1-mini',
      templateSnapshot: snapshotTemplate({ ...DEFAULT_TEMPLATE, fields: opts.fields ?? DEFAULT_TEMPLATE.fields }),
      inputTokens: 1,
      outputTokens: 1,
      durationMs: 1,
    })
    .returning()
  await testDb.db
    .insert(invoice)
    .values(invoices.map((rawValues, position) => ({ extractionId: created!.id, documentId, userId, position, rawValues })))
  await createChecksRunner(testDb.db).run({ userId, documentId, extractionId: created!.id })
  return { extractionId: created!.id, invoices: await listInvoices(testDb.db, userId, created!.id) }
}

async function resultsOf(invoiceId: string, userId = alice): Promise<CheckResult[]> {
  const [row] = await testDb.db.select().from(invoice).where(and(eq(invoice.id, invoiceId), eq(invoice.userId, userId)))
  return row!.checkResults!
}

async function statusOf(invoiceId: string, id: CheckId, userId = alice) {
  return (await resultsOf(invoiceId, userId)).find((r) => r.id === id)?.status
}

describe('Checks after an Extraction', () => {
  it('stores the Check results of every Invoice of the Extraction', async () => {
    const doc = await newDocument()
    const { invoices } = await extract(doc.id, [invoiceValues(), invoiceValues({ total: 200 })])
    expect(invoices[0]!.checkResults).toHaveLength(6)
    expect(await statusOf(invoices[0]!.id, 'totals_sum')).toBe('pass')
    expect(await statusOf(invoices[1]!.id, 'totals_sum')).toBe('fail')
  })

  it('checks against the Extraction’s Template Snapshot', async () => {
    const doc = await newDocument()
    const fields = DEFAULT_TEMPLATE.fields.filter((f) => f.key !== 'tax_total')
    const { invoices } = await extract(doc.id, [invoiceValues({ total: 999 })], { fields })
    expect(await statusOf(invoices[0]!.id, 'totals_sum')).toBe('not_applicable')
  })

  it('flags possible duplicates across Documents, on both Invoices', async () => {
    const first = await extract((await newDocument()).id, [invoiceValues({ invoice_number: 'DUP-1' })])
    const second = await extract((await newDocument()).id, [
      invoiceValues({ invoice_number: 'dup-1 ', vendor: { name: 'ACME GmbH' } }),
    ])
    const a = first.invoices[0]!.id
    const b = second.invoices[0]!.id
    expect((await resultsOf(a)).find((r) => r.id === 'duplicate')).toMatchObject({
      status: 'fail',
      relatedInvoiceIds: [b],
    })
    expect((await resultsOf(b)).find((r) => r.id === 'duplicate')).toMatchObject({
      status: 'fail',
      relatedInvoiceIds: [a],
    })
  })

  it('ignores Invoices of earlier Extractions, and clears the flag when a re-run replaces them', async () => {
    const docA = await newDocument()
    await extract(docA.id, [invoiceValues({ invoice_number: 'RERUN-1' })])
    // Re-running the same Document must not flag it against its own history.
    const a2 = await extract(docA.id, [invoiceValues({ invoice_number: 'RERUN-1' })])
    expect(await statusOf(a2.invoices[0]!.id, 'duplicate')).toBe('pass')

    const b = await extract((await newDocument()).id, [invoiceValues({ invoice_number: 'RERUN-1' })])
    expect(await statusOf(b.invoices[0]!.id, 'duplicate')).toBe('fail')
    expect(await statusOf(a2.invoices[0]!.id, 'duplicate')).toBe('fail')

    await extract(docA.id, [invoiceValues({ invoice_number: 'RERUN-2' })])
    expect(await statusOf(b.invoices[0]!.id, 'duplicate')).toBe('pass')
  })

  it('never compares with another User’s Invoices', async () => {
    await extract((await newDocument(bob)).id, [invoiceValues({ invoice_number: 'SHARED-1' })], { userId: bob })
    const mine = await extract((await newDocument()).id, [invoiceValues({ invoice_number: 'SHARED-1' })])
    expect(await statusOf(mine.invoices[0]!.id, 'duplicate')).toBe('pass')
  })
})

describe('recheckInvoice after a correction', () => {
  it('checks Raw Values overlaid with Corrected Values', async () => {
    const { invoices } = await extract((await newDocument()).id, [invoiceValues({ total: 200 })])
    const id = invoices[0]!.id
    expect(await statusOf(id, 'totals_sum')).toBe('fail')

    await testDb.db.update(invoice).set({ correctedValues: { total: 119 } }).where(eq(invoice.id, id))
    const results = await recheckInvoice(testDb.db, alice, id)

    expect(results?.find((r) => r.id === 'totals_sum')?.status).toBe('pass')
    expect(await statusOf(id, 'totals_sum')).toBe('pass')
  })

  it('overlays a corrected value inside a group', async () => {
    const { invoices } = await extract((await newDocument()).id, [invoiceValues({ vendor: { name: null } })])
    const id = invoices[0]!.id
    expect(await statusOf(id, 'required_fields')).toBe('fail')
    await testDb.db.update(invoice).set({ correctedValues: { vendor: { name: 'Acme GmbH' } } }).where(eq(invoice.id, id))
    await recheckInvoice(testDb.db, alice, id)
    expect(await statusOf(id, 'required_fields')).toBe('pass')
  })

  it('re-checks the Invoices it was, or becomes, a duplicate of', async () => {
    const a = (await extract((await newDocument()).id, [invoiceValues({ invoice_number: 'FIX-1' })])).invoices[0]!.id
    const b = (await extract((await newDocument()).id, [invoiceValues({ invoice_number: 'FIX-1' })])).invoices[0]!.id
    const c = (await extract((await newDocument()).id, [invoiceValues({ invoice_number: 'FIX-2' })])).invoices[0]!.id

    // b is corrected from FIX-1 to FIX-2: a is no longer a duplicate, c now is.
    await testDb.db.update(invoice).set({ correctedValues: { invoice_number: 'FIX-2' } }).where(eq(invoice.id, b))
    await recheckInvoice(testDb.db, alice, b)

    expect(await statusOf(a, 'duplicate')).toBe('pass')
    expect((await resultsOf(c)).find((r) => r.id === 'duplicate')).toMatchObject({
      status: 'fail',
      relatedInvoiceIds: [b],
    })
  })

  it('returns null for an Invoice the User does not own', async () => {
    const { invoices } = await extract((await newDocument()).id, [invoiceValues()])
    expect(await recheckInvoice(testDb.db, bob, invoices[0]!.id)).toBeNull()
  })
})
