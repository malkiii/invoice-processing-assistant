import { eq } from 'drizzle-orm'
import type { LanguageModel } from 'ai'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateInstanceSettings } from '../../server/db/instance-settings'
import { batch, document, user } from '../../server/db/schema'
import { updateUserPreferences } from '../../server/db/user-preferences'
import { createDocumentLibrary, type DocumentLibrary } from '../../server/domain/document-library'
import type { DocumentFormat } from '../../server/domain/document-inspection'
import { MIME_TYPES } from '../../server/domain/document-inspection'
import { createExtractionRunner, type ChecksRunner, type ExtractionRunner } from '../../server/domain/extraction/runner'
import { listExtractions, listInvoices } from '../../server/domain/extractions'
import { storageKeyFor } from '../../server/domain/storage-keys'
import { DEFAULT_TEMPLATE_ID } from '../../server/domain/template/default-template'
import { createProviderConnections, type ProviderConnections } from '../../server/lib/provider-connections'
import { makeTextPdf, PNG } from '../fixtures/documents/make'
import { fakeModel, httpError, reply, type Step } from '../support/fake-llm'
import { startTestDatabase, type TestDatabase } from './support/database'
import { createFakeProviderHttp } from './support/fake-provider-http'
import { startTestStorage, type TestStorage } from './support/storage'

let testDb: TestDatabase
let testStorage: TestStorage
let library: DocumentLibrary
let providers: ProviderConnections
let connectionId: string

const alice = 'user-alice'
const http = createFakeProviderHttp()

/** The model the runner gets for the next calls; swapped per test. */
let script: Step[] = []
let lastModel: ReturnType<typeof fakeModel> | undefined
const checks: ChecksRunner = { run: vi.fn(async () => {}) }

beforeAll(async () => {
  ;[testDb, testStorage] = await Promise.all([startTestDatabase(), startTestStorage()])
  await testDb.db.insert(user).values([{ id: alice, name: 'Alice', email: 'alice@example.com' }])
  library = createDocumentLibrary({ db: testDb.db, storage: testStorage.storage })
  providers = createProviderConnections({ db: testDb.db, encryptionKey: Buffer.alloc(32, 1), fetch: http.fetch })
  const connection = await providers.create(alice, { kind: 'openai', name: 'OpenAI', apiKey: http.validKey })
  connectionId = connection.id
  await updateUserPreferences(testDb.db, alice, { defaultConnectionId: connectionId, defaultModel: 'gpt-4.1-mini' })
})

afterAll(async () => {
  await Promise.all([testDb?.stop(), testStorage?.stop()])
})

beforeEach(() => {
  script = []
  vi.mocked(checks.run).mockClear()
})

function runner(overrides: { useRealProvider?: boolean } = {}): ExtractionRunner {
  return createExtractionRunner({
    db: testDb.db,
    storage: testStorage.storage,
    providers: overrides.useRealProvider
      ? providers
      : {
          ...providers,
          languageModel: async (userId: string, id: string, modelId: string): Promise<LanguageModel | null> => {
            if (!(await providers.get(userId, id))) return null
            return (lastModel = fakeModel(script, modelId))
          },
        },
    rasterizePdf: async () => [PNG],
    checks,
    sleep: async () => {},
  })
}

async function queuedDocument(bytes: Uint8Array, format: DocumentFormat, userId = alice) {
  const [b] = await testDb.db.insert(batch).values({ userId, source: 'upload' }).returning()
  const [doc] = await testDb.db
    .insert(document)
    .values({
      userId,
      batchId: b!.id,
      source: 'upload',
      name: `invoice.${format}`,
      status: 'queued',
      format,
      mimeType: MIME_TYPES[format],
      sizeBytes: bytes.length,
    })
    .returning()
  const key = storageKeyFor(userId, doc!.id)
  await testStorage.storage.write(key, bytes, MIME_TYPES[format])
  await testDb.db.update(document).set({ storageKey: key }).where(eq(document.id, doc!.id))
  return doc!
}

const invoiceA = {
  vendor: { name: 'Acme GmbH', address: 'Hauptstr. 1, Berlin', tax_id: 'DE123456789' },
  buyer: { name: 'Globex Ltd', address: null, tax_id: null },
  invoice_number: 'INV-1001',
  issue_date: '2026-03-01',
  due_date: '2026-03-31',
  currency: 'EUR',
  line_items: [{ description: 'Consulting', quantity: 2, unit_price: 500, amount: 1000, tax_rate: 19 }],
  subtotal: 1000,
  tax_total: 190,
  total: 1190,
  payment_terms: 'Net 30',
}
const invoiceB = { ...invoiceA, invoice_number: 'INV-1002', total: 595, subtotal: 500, tax_total: 95 }

describe('extraction runner', () => {
  it('turns a queued PDF into an Extraction with Invoices holding Raw Values', async () => {
    const doc = await queuedDocument(await makeTextPdf([['Invoice INV-1001']]), 'pdf')
    script = [reply({ invoices: [invoiceA] }, { input: 1200, output: 300 })]
    await providers.saveModelSetting(alice, connectionId, 'gpt-4.1-mini', {
      price: { inputPerMillion: 2, outputPerMillion: 8 },
    })

    expect(await runner().process({ documentId: doc.id })).toEqual({ kind: 'done' })

    expect((await library.getDocument(alice, doc.id))!.status).toBe('extracted')
    const [extraction, ...others] = await listExtractions(testDb.db, alice, doc.id)
    expect(others).toEqual([])
    expect(extraction).toMatchObject({
      isCurrent: true,
      connectionId,
      providerKind: 'openai',
      modelId: 'gpt-4.1-mini',
      templateId: DEFAULT_TEMPLATE_ID,
      templateName: 'Invoice (default)',
      inputTokens: 1200,
      outputTokens: 300,
      invoiceCount: 1,
    })
    expect(extraction!.estimatedCost).toBeCloseTo((1200 * 2 + 300 * 8) / 1_000_000)
    expect(extraction!.durationMs).toBeGreaterThanOrEqual(0)
    expect(extraction!.templateSnapshot.fields.map((f) => f.key)).toContain('invoice_number')

    const invoices = await listInvoices(testDb.db, alice, extraction!.id)
    expect(invoices.map((i) => i.rawValues)).toEqual([invoiceA])
    expect(checks.run).toHaveBeenCalledWith({ userId: alice, documentId: doc.id, extractionId: extraction!.id })
  })

  it('yields one Invoice per invoice in a Document holding several', async () => {
    const doc = await queuedDocument(await makeTextPdf([['INV-1001'], ['INV-1002']]), 'pdf')
    script = [reply({ invoices: [invoiceA, invoiceB] })]
    await runner().process({ documentId: doc.id })
    const [extraction] = await listExtractions(testDb.db, alice, doc.id)
    const invoices = await listInvoices(testDb.db, alice, extraction!.id)
    expect(invoices.map((i) => i.rawValues.invoice_number)).toEqual(['INV-1001', 'INV-1002'])
  })

  it('presents the Document according to the Model Capability', async () => {
    const pdf = await makeTextPdf([['Invoice INV-1001 total 1190.00']])
    await providers.saveModelSetting(alice, connectionId, 'text-only-model', { capabilityOverride: 'text' })
    const doc = await queuedDocument(pdf, 'pdf')
    script = [reply({ invoices: [invoiceA] })]
    await runner().process({ documentId: doc.id, modelId: 'text-only-model' })
    const prompt = JSON.stringify(lastModel!.doGenerateCalls[0]!.prompt)
    expect(prompt).toContain('INV-1001 total 1190.00')
    expect(prompt).not.toContain('application/pdf')
  })

  it('marks the Document failed with a readable reason when the model keeps failing', async () => {
    const doc = await queuedDocument(await makeTextPdf([['x']]), 'pdf')
    script = [httpError(500), httpError(500), httpError(500)]
    expect(await runner().process({ documentId: doc.id })).toEqual({ kind: 'done' })
    const failed = await library.getDocument(alice, doc.id)
    expect(failed).toMatchObject({ status: 'failed', failureReason: expect.stringMatching(/provider.*500/i) })
    expect(await listExtractions(testDb.db, alice, doc.id)).toEqual([])
  })

  it('fails a Document the model cannot read', async () => {
    await providers.saveModelSetting(alice, connectionId, 'text-only-model', { capabilityOverride: 'text' })
    const doc = await queuedDocument(PNG, 'png')
    await runner().process({ documentId: doc.id, modelId: 'text-only-model' })
    expect(await library.getDocument(alice, doc.id)).toMatchObject({
      status: 'failed',
      failureReason: expect.stringMatching(/cannot read images/i),
    })
  })

  it('ignores a Document that is no longer queued, or was deleted', async () => {
    const doc = await queuedDocument(await makeTextPdf([['x']]), 'pdf')
    script = [reply({ invoices: [invoiceA] })]
    await runner().process({ documentId: doc.id })
    expect(await runner().process({ documentId: doc.id })).toEqual({ kind: 'done' })
    expect(await listExtractions(testDb.db, alice, doc.id)).toHaveLength(1)
    expect(await runner().process({ documentId: '00000000-0000-4000-8000-000000000000' })).toEqual({ kind: 'done' })
  })

  it('makes a new Extraction the Current Extraction, keeping the old one as history', async () => {
    const doc = await queuedDocument(await makeTextPdf([['x']]), 'pdf')
    script = [reply({ invoices: [invoiceA] })]
    await runner().process({ documentId: doc.id })
    await testDb.db.update(document).set({ status: 'queued' }).where(eq(document.id, doc.id))
    script = [reply({ invoices: [invoiceB] })]
    await runner().process({ documentId: doc.id })
    const history = await listExtractions(testDb.db, alice, doc.id)
    expect(history.map((e) => e.isCurrent)).toEqual([true, false])
    const current = await listInvoices(testDb.db, alice, history[0]!.id)
    expect(current[0]!.rawValues.invoice_number).toBe('INV-1002')
  })

  it('fails clearly when the User has no default Provider Connection', async () => {
    await testDb.db.insert(user).values({ id: 'user-nobody', name: 'N', email: 'n@example.com' })
    const doc = await queuedDocument(await makeTextPdf([['x']]), 'pdf', 'user-nobody')
    await runner().process({ documentId: doc.id })
    expect(await library.getDocument('user-nobody', doc.id)).toMatchObject({
      status: 'failed',
      failureReason: expect.stringMatching(/Provider Connection/),
    })
  })
})

describe('a rejected API key (401)', () => {
  it('marks the Provider Connection broken and pauses the User\'s queue until it is fixed', async () => {
    const bob = 'user-bob'
    await testDb.db.insert(user).values({ id: bob, name: 'Bob', email: 'bob@example.com' })
    const connection = await providers.create(bob, { kind: 'openai', name: 'Bad key', apiKey: 'sk-wrong-key-0000' })
    await updateUserPreferences(testDb.db, bob, { defaultConnectionId: connection.id, defaultModel: 'gpt-4.1-mini' })
    const first = await queuedDocument(await makeTextPdf([['x']]), 'pdf', bob)
    const second = await queuedDocument(await makeTextPdf([['y']]), 'pdf', bob)
    const real = runner({ useRealProvider: true })

    const outcome = await real.process({ documentId: first.id })

    expect(outcome).toMatchObject({ kind: 'deferred', reason: 'paused' })
    expect(await providers.get(bob, connection.id)).toMatchObject({
      status: 'broken',
      statusMessage: expect.stringMatching(/401/),
    })
    // Back in the queue, not failed: it runs once the key is fixed.
    expect((await library.getDocument(bob, first.id))!.status).toBe('queued')

    const callsBefore = http.requests.length
    expect(await real.process({ documentId: second.id })).toMatchObject({ kind: 'deferred', reason: 'paused' })
    expect(http.requests.length).toBe(callsBefore)
    expect((await library.getDocument(bob, second.id))!.status).toBe('queued')

    // Fixing the key resumes the queue.
    await providers.update(bob, connection.id, { apiKey: http.validKey })
    script = [reply({ invoices: [invoiceA] })]
    expect(await runner().process({ documentId: second.id })).toEqual({ kind: 'done' })
    expect((await library.getDocument(bob, second.id))!.status).toBe('extracted')
  })
})

describe('per-User concurrency', () => {
  it('runs at most the configured number of Extractions per User at once', async () => {
    const carol = 'user-carol'
    await testDb.db.insert(user).values({ id: carol, name: 'Carol', email: 'carol@example.com' })
    const connection = await providers.create(carol, { kind: 'openai', name: 'OpenAI', apiKey: http.validKey })
    await updateUserPreferences(testDb.db, carol, { defaultConnectionId: connection.id, defaultModel: 'gpt-4.1-mini' })
    await updateInstanceSettings(testDb.db, { maxConcurrentDocumentsPerUser: 2 })
    const docs = await Promise.all([1, 2, 3].map(async (n) => queuedDocument(await makeTextPdf([[`doc ${n}`]]), 'pdf', carol)))

    // Hold every model call open until released, so the first Extractions stay in flight.
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    let inFlight = 0
    let maxInFlight = 0
    const slow: Step = async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await gate
      inFlight--
      return reply({ invoices: [invoiceA] })
    }
    script = [slow, slow, slow]

    const pending = docs.map((d) => runner().process({ documentId: d.id }))
    await vi.waitFor(() => expect(inFlight).toBe(2))
    release()
    const outcomes = await Promise.all(pending)

    expect(maxInFlight).toBe(2)
    expect(outcomes.filter((o) => o.kind === 'done')).toHaveLength(2)
    expect(outcomes.filter((o) => o.kind === 'deferred')).toEqual([{ kind: 'deferred', reason: 'busy', seconds: expect.any(Number) }])
    await updateInstanceSettings(testDb.db, { maxConcurrentDocumentsPerUser: 3 })
  })
})
