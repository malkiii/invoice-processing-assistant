import { eq } from 'drizzle-orm'
import type { LanguageModel } from 'ai'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { batch, document, template, user } from '../../server/db/schema'
import { updateUserPreferences } from '../../server/db/user-preferences'
import { MIME_TYPES } from '../../server/domain/document-inspection'
import type { ExtractionJob } from '../../server/domain/extraction/runner'
import { createExtractionRunner } from '../../server/domain/extraction/runner'
import { listExtractions, listInvoices } from '../../server/domain/extractions'
import { createReextraction, RerunError, type Reextraction } from '../../server/domain/review/rerun'
import { createReview, type Review } from '../../server/domain/review/review'
import { storageKeyFor } from '../../server/domain/storage-keys'
import { DEFAULT_TEMPLATE, DEFAULT_TEMPLATE_ID } from '../../server/domain/template/default-template'
import { createProviderConnections, type ProviderConnections } from '../../server/lib/provider-connections'
import { makeTextPdf, PNG } from '../fixtures/documents/make'
import { fakeModel, reply, type Step } from '../support/fake-llm'
import { startTestDatabase, type TestDatabase } from './support/database'
import { createFakeProviderHttp } from './support/fake-provider-http'
import { startTestStorage, type TestStorage } from './support/storage'

let testDb: TestDatabase
let testStorage: TestStorage
let providers: ProviderConnections
let review: Review
let reextraction: Reextraction
let connectionId: string
let script: Step[] = []
const enqueued: ExtractionJob[] = []

const alice = 'user-alice'
const bob = 'user-bob'
const http = createFakeProviderHttp()

const party = { name: 'Acme GmbH', address: null, tax_id: null }
const invoiceA = {
  vendor: party,
  buyer: { ...party, name: 'Globex' },
  invoice_number: 'INV-1',
  issue_date: '2026-03-01',
  due_date: null,
  currency: 'EUR',
  line_items: [{ description: 'Consulting', quantity: 1, unit_price: 1000, amount: 1000, tax_rate: 19 }],
  subtotal: 1000,
  tax_total: 190,
  total: 1190,
  payment_terms: null,
}

beforeAll(async () => {
  ;[testDb, testStorage] = await Promise.all([startTestDatabase(), startTestStorage()])
  await testDb.db.insert(user).values([
    { id: alice, name: 'Alice', email: 'alice@example.com' },
    { id: bob, name: 'Bob', email: 'bob@example.com' },
  ])
  providers = createProviderConnections({ db: testDb.db, encryptionKey: Buffer.alloc(32, 1), fetch: http.fetch })
  connectionId = (await providers.create(alice, { kind: 'openai', name: 'OpenAI', apiKey: http.validKey })).id
  await updateUserPreferences(testDb.db, alice, { defaultConnectionId: connectionId, defaultModel: 'gpt-4.1-mini' })
  review = createReview({ db: testDb.db })
  reextraction = createReextraction({
    db: testDb.db,
    queue: { enqueue: async (documentId, choice) => void enqueued.push({ documentId, ...choice }) },
  })
})

afterAll(async () => {
  await Promise.all([testDb?.stop(), testStorage?.stop()])
})

const runner = () =>
  createExtractionRunner({
    db: testDb.db,
    storage: testStorage.storage,
    providers: {
      ...providers,
      languageModel: async (_userId: string, _id: string, modelId: string): Promise<LanguageModel> =>
        fakeModel(script, modelId),
    },
    rasterizePdf: async () => [PNG],
    sleep: async () => {},
  })

async function extractedDocument(userId = alice) {
  const bytes = await makeTextPdf([['Invoice INV-1']])
  const [b] = await testDb.db.insert(batch).values({ userId, source: 'upload' }).returning()
  const [doc] = await testDb.db
    .insert(document)
    .values({ userId, batchId: b!.id, source: 'upload', name: 'inv.pdf', status: 'queued', format: 'pdf', mimeType: MIME_TYPES.pdf, sizeBytes: bytes.length })
    .returning()
  const key = storageKeyFor(userId, doc!.id)
  await testStorage.storage.write(key, bytes, MIME_TYPES.pdf)
  await testDb.db.update(document).set({ storageKey: key }).where(eq(document.id, doc!.id))
  if (userId === alice) {
    script = [reply({ invoices: [invoiceA] })]
    await runner().process({ documentId: doc!.id })
  }
  return doc!
}

async function currentInvoices(documentId: string) {
  const current = (await listExtractions(testDb.db, alice, documentId)).find((e) => e.isCurrent)!
  return listInvoices(testDb.db, alice, current.id)
}

describe('Re-run', () => {
  it('creates a new Current Extraction; the old corrections stay only in the history', async () => {
    const doc = await extractedDocument()
    const [first] = await currentInvoices(doc.id)
    await review.correctField(alice, first!.id, 'total', 1200)
    expect(await reextraction.currentHasCorrections(alice, doc.id)).toBe(true)

    enqueued.length = 0
    await reextraction.rerun(alice, doc.id, { connectionId, modelId: 'gpt-4.1', templateId: DEFAULT_TEMPLATE_ID })

    expect(enqueued).toEqual([{ documentId: doc.id, connectionId, modelId: 'gpt-4.1', templateId: DEFAULT_TEMPLATE_ID }])
    const [queued] = await testDb.db.select().from(document).where(eq(document.id, doc.id))
    expect(queued!.status).toBe('queued')

    script = [reply({ invoices: [{ ...invoiceA, total: 1190.5 }] })]
    await runner().process(enqueued[0]!)

    const history = await listExtractions(testDb.db, alice, doc.id)
    expect(history).toHaveLength(2)
    expect(history[0]!.isCurrent).toBe(true)
    expect(history[0]!.modelId).toBe('gpt-4.1')
    const [fresh] = await currentInvoices(doc.id)
    expect(fresh!.correctedValues).toEqual({})
    expect(await reextraction.currentHasCorrections(alice, doc.id)).toBe(false)

    const table = await review.listInvoices(alice, { search: 'inv.pdf' })
    expect(table.map((r) => r.id)).toEqual([fresh!.id])
    const old = await review.getInvoice(alice, first!.id)
    expect(old!.isCurrentExtraction).toBe(false)
    expect(old!.values.total).toBe(1200)
  })

  it('switches the Current Extraction back from the history', async () => {
    const doc = await extractedDocument()
    const [first] = await currentInvoices(doc.id)
    await reextraction.rerun(alice, doc.id, {})
    script = [reply({ invoices: [invoiceA] })]
    await runner().process({ documentId: doc.id })
    const oldExtraction = (await listExtractions(testDb.db, alice, doc.id)).find((e) => !e.isCurrent)!

    expect(await reextraction.setCurrentExtraction(alice, doc.id, oldExtraction.id)).toBe(true)

    expect((await currentInvoices(doc.id)).map((i) => i.id)).toEqual([first!.id])
    expect((await listExtractions(testDb.db, alice, doc.id)).filter((e) => e.isCurrent)).toHaveLength(1)
  })

  it('refuses another User’s Document, Provider Connection or Template', async () => {
    const doc = await extractedDocument()
    const bobsDoc = await extractedDocument(bob)
    const bobsConnection = await providers.create(bob, { kind: 'openai', name: 'B', apiKey: http.validKey })
    const [bobsTemplate] = await testDb.db
      .insert(template)
      .values({ userId: bob, name: 'Bob’s', fields: DEFAULT_TEMPLATE.fields })
      .returning()

    await expect(reextraction.rerun(alice, bobsDoc.id, {})).rejects.toThrow(RerunError)
    await expect(reextraction.rerun(alice, doc.id, { connectionId: bobsConnection.id })).rejects.toThrow(RerunError)
    await expect(reextraction.rerun(alice, doc.id, { templateId: bobsTemplate!.id })).rejects.toThrow(RerunError)
    expect(await reextraction.setCurrentExtraction(bob, doc.id, 'x')).toBe(false)
  })

  it('refuses a Document that is still waiting for or running an Extraction', async () => {
    const doc = await extractedDocument()
    await reextraction.rerun(alice, doc.id, {})
    await expect(reextraction.rerun(alice, doc.id, {})).rejects.toThrow(/already/)
  })

  it('lists the User’s Templates and the built-in default for the picker', async () => {
    await testDb.db.insert(template).values({ userId: alice, name: 'Alice’s', fields: DEFAULT_TEMPLATE.fields })
    const names = (await reextraction.templateChoices(alice)).map((t) => t.name)
    expect(names).toContain(DEFAULT_TEMPLATE.name)
    expect(names).toContain('Alice’s')
    expect(names).not.toContain('Bob’s')
  })
})
