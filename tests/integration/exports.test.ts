import { eq } from 'drizzle-orm'
import JSZip from 'jszip'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { batch, document, extraction, invoice, user } from '../../server/db/schema'
import { createExports, ExportError, type Exports } from '../../server/domain/export/exports'
import { DEFAULT_TEMPLATE, DEFAULT_TEMPLATE_ID } from '../../server/domain/template/default-template'
import { snapshotTemplate } from '../../server/domain/template/snapshot'
import { startTestDatabase, type TestDatabase } from './support/database'
import { startTestStorage, type TestStorage } from './support/storage'

let testDb: TestDatabase
let testStorage: TestStorage
let exports: Exports
const queued: string[] = []

const alice = 'user-alice'
const bob = 'user-bob'

beforeAll(async () => {
  ;[testDb, testStorage] = await Promise.all([startTestDatabase(), startTestStorage()])
  await testDb.db.insert(user).values([
    { id: alice, name: 'Alice', email: 'alice@example.com' },
    { id: bob, name: 'Bob', email: 'bob@example.com' },
  ])
  exports = createExports({
    db: testDb.db,
    storage: testStorage.storage,
    queue: { enqueue: async (id) => void queued.push(id) },
    inlineLimit: 3,
  })
})

afterAll(async () => {
  await Promise.all([testDb?.stop(), testStorage?.stop()])
})

const values = (number: string, total: number, items = 1) => ({
  vendor: { name: 'Acme GmbH', address: null, tax_id: null },
  invoice_number: number,
  currency: 'EUR',
  total,
  line_items: Array.from({ length: items }, (_, i) => ({ description: `Line ${i + 1}`, amount: total / items })),
})

/** A Batch with one Document whose Current Extraction holds the given Invoices. */
async function extracted(raws: Record<string, unknown>[], opts: { userId?: string; reviewed?: boolean; batchId?: string } = {}) {
  const userId = opts.userId ?? alice
  const batchId = opts.batchId ?? (await testDb.db.insert(batch).values({ userId, source: 'upload' }).returning())[0]!.id
  const [doc] = await testDb.db
    .insert(document)
    .values({ userId, batchId, source: 'upload', name: 'invoices.pdf', status: 'extracted', format: 'pdf' })
    .returning()
  const ex = async (isCurrent: boolean) =>
    (
      await testDb.db
        .insert(extraction)
        .values({
          documentId: doc!.id,
          userId,
          isCurrent,
          providerKind: 'openai',
          modelId: 'gpt-4.1-mini',
          templateId: DEFAULT_TEMPLATE_ID,
          templateSnapshot: snapshotTemplate({ id: DEFAULT_TEMPLATE_ID, ...DEFAULT_TEMPLATE }),
          inputTokens: 1,
          outputTokens: 1,
          durationMs: 1,
        })
        .returning()
    )[0]!
  // An earlier Extraction kept as history: its Invoices are never exported.
  const old = await ex(false)
  await testDb.db.insert(invoice).values({ extractionId: old.id, documentId: doc!.id, userId, position: 0, rawValues: values('OLD', 1) })
  const current = await ex(true)
  const rows = await testDb.db
    .insert(invoice)
    .values(
      raws.map((rawValues, position) => ({
        extractionId: current.id,
        documentId: doc!.id,
        userId,
        position,
        rawValues,
        reviewedAt: opts.reviewed ? new Date() : null,
      })),
    )
    .returning()
  return { batchId, ids: rows.map((r) => r.id) }
}

async function download(userId: string, exportId: string): Promise<Uint8Array> {
  const url = await exports.downloadUrl(userId, exportId)
  expect(url).toBeTruthy()
  const res = await fetch(url!)
  expect(res.ok).toBe(true)
  expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="invoices-/)
  return new Uint8Array(await res.arrayBuffer())
}

describe('Exports', () => {
  it('exports a single Invoice as JSON with Corrected Values overlaid, and lists it in the history', async () => {
    const { ids } = await extracted([values('INV-1', 100)])
    await testDb.db.update(invoice).set({ correctedValues: { invoice_number: 'INV-1-FIXED' } }).where(eq(invoice.id, ids[0]!))

    const done = await exports.request(alice, { format: 'json', scope: { kind: 'invoice', invoiceId: ids[0]! } })
    expect(done).toMatchObject({ status: 'ready', invoiceCount: 1, format: 'json' })
    expect(done.fileName).toMatch(/^invoices-\d{4}-\d{2}-\d{2}-\d{4}\.json$/)

    const json = JSON.parse(new TextDecoder().decode(await download(alice, done.id)))
    expect(json.invoices.map((i: { values: { invoice_number: string } }) => i.values.invoice_number)).toEqual(['INV-1-FIXED'])

    expect((await exports.list(alice))[0]).toMatchObject({ id: done.id, status: 'ready' })
    expect(await exports.list(bob)).toEqual([])
    expect(await exports.downloadUrl(bob, done.id)).toBeNull()
  })

  it('exports a Batch as a CSV zip, only the Current Extraction, and honours Reviewed only', async () => {
    const { batchId } = await extracted([values('B-1', 10, 2)], { reviewed: true })
    await extracted([values('B-2', 20)], { batchId })

    const all = await exports.request(alice, { format: 'csv', csvLayout: 'zip', scope: { kind: 'batch', batchId } })
    expect(all).toMatchObject({ status: 'ready', invoiceCount: 2 })
    const zip = await JSZip.loadAsync(await download(alice, all.id))
    const invoicesCsv = await zip.file('invoices.csv')!.async('string')
    expect(invoicesCsv).toContain('B-1')
    expect(invoicesCsv).toContain('B-2')
    expect(invoicesCsv).not.toContain('OLD')
    expect((await zip.file('line_items.csv')!.async('string')).trim().split('\r\n')).toHaveLength(4)

    const reviewed = await exports.request(alice, { format: 'csv', scope: { kind: 'batch', batchId }, reviewedOnly: true })
    expect(reviewed.invoiceCount).toBe(1)
    const csv = new TextDecoder().decode(await download(alice, reviewed.id))
    expect(csv).toContain('B-1')
    expect(csv).not.toContain('B-2')
  })

  it('refuses an Export with nothing in scope, including another User’s Invoices', async () => {
    const { ids } = await extracted([values('BOB-1', 5)], { userId: bob })
    await expect(exports.request(alice, { format: 'csv', scope: { kind: 'selection', invoiceIds: ids } })).rejects.toThrow(ExportError)
    await expect(
      exports.request(alice, { format: 'csv', scope: { kind: 'invoice', invoiceId: 'not-a-uuid' } }),
    ).rejects.toThrow(ExportError)
  })

  it('exports the current filter of the Invoice table', async () => {
    await extracted([values('FILTER-ME-1', 1), values('FILTER-ME-2', 2)])
    const done = await exports.request(alice, { format: 'csv', scope: { kind: 'filter', filter: { search: 'FILTER-ME' } } })
    expect(done.invoiceCount).toBe(2)
  })

  it('leaves Exports above the inline limit pending for the worker, which then generates XLSX', async () => {
    const { ids } = await extracted([values('L-1', 1), values('L-2', 2), values('L-3', 3), values('L-4', 4)])
    const pending = await exports.request(alice, { format: 'xlsx', scope: { kind: 'selection', invoiceIds: ids } })
    expect(pending).toMatchObject({ status: 'pending', invoiceCount: 4, fileName: null })
    expect(queued).toEqual([pending.id])
    expect(await exports.downloadUrl(alice, pending.id)).toBeNull()

    await exports.generate(pending.id)
    const [listed] = await exports.list(alice)
    expect(listed).toMatchObject({ id: pending.id, status: 'ready', invoiceCount: 4 })
    const zip = await JSZip.loadAsync(await download(alice, pending.id))
    expect(await zip.file('xl/worksheets/sheet1.xml')!.async('string')).toContain('L-4')
  })

  it('leaves no file behind when the Export is deleted while it is being generated', async () => {
    const { ids } = await extracted([values('RACE-1', 1), values('RACE-2', 2), values('RACE-3', 3), values('RACE-4', 4)])
    const pending = await exports.request(alice, { format: 'csv', scope: { kind: 'selection', invoiceIds: ids } })
    const racing = createExports({
      db: testDb.db,
      queue: { enqueue: async () => {} },
      storage: {
        ...testStorage.storage,
        async write(key, bytes, contentType) {
          await exports.remove(alice, pending.id) // the User deletes it mid-generation
          await testStorage.storage.write(key, bytes, contentType)
        },
      },
    })
    await racing.generate(pending.id)
    expect(await testStorage.storage.size(`users/${alice}/exports/${pending.id}`)).toBeNull()
  })

  it('deletes an Export and its file', async () => {
    const { ids } = await extracted([values('DEL-1', 1)])
    const done = await exports.request(alice, { format: 'json', scope: { kind: 'invoice', invoiceId: ids[0]! } })
    expect(await exports.remove(bob, done.id)).toBe(false)
    expect(await exports.remove(alice, done.id)).toBe(true)
    expect((await exports.list(alice)).map((e) => e.id)).not.toContain(done.id)
    expect(await testStorage.storage.size(`users/${alice}/exports/${done.id}`)).toBeNull()
  })
})
