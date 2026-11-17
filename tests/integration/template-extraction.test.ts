/**
 * Templates editor acceptance (issue 09) at the domain level: a custom Template passed as a job's
 * `templateId` (as Re-run does) shapes the Invoices, and editing it later leaves old Extractions
 * rendering from their Template Snapshot (ADR 0006).
 */
import { eq } from 'drizzle-orm'
import type { LanguageModel } from 'ai'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { batch, document, user } from '../../server/db/schema'
import { updateUserPreferences } from '../../server/db/user-preferences'
import { MIME_TYPES } from '../../server/domain/document-inspection'
import { createExtractionRunner } from '../../server/domain/extraction/runner'
import { listExtractions, listInvoices } from '../../server/domain/extractions'
import { storageKeyFor } from '../../server/domain/storage-keys'
import { cloneTemplate, createTemplate, updateTemplate } from '../../server/domain/templates'
import { DEFAULT_TEMPLATE_ID } from '../../server/domain/template/default-template'
import { createProviderConnections, type ProviderConnections } from '../../server/lib/provider-connections'
import { makeTextPdf, PNG } from '../fixtures/documents/make'
import { fakeModel, reply, type Step } from '../support/fake-llm'
import { startTestDatabase, type TestDatabase } from './support/database'
import { createFakeProviderHttp } from './support/fake-provider-http'
import { startTestStorage, type TestStorage } from './support/storage'

let testDb: TestDatabase
let testStorage: TestStorage
let providers: ProviderConnections
let script: Step[] = []
let lastModel: ReturnType<typeof fakeModel> | undefined

const dana = 'user-dana'
const http = createFakeProviderHttp()

beforeAll(async () => {
  ;[testDb, testStorage] = await Promise.all([startTestDatabase(), startTestStorage()])
  await testDb.db.insert(user).values([{ id: dana, name: 'Dana', email: 'dana@example.com' }])
  providers = createProviderConnections({ db: testDb.db, encryptionKey: Buffer.alloc(32, 3), fetch: http.fetch })
  const connection = await providers.create(dana, { kind: 'openai', name: 'OpenAI', apiKey: http.validKey })
  await updateUserPreferences(testDb.db, dana, { defaultConnectionId: connection.id, defaultModel: 'gpt-4.1-mini' })
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
      languageModel: async (userId: string, id: string, modelId: string): Promise<LanguageModel | null> => {
        if (!(await providers.get(userId, id))) return null
        return (lastModel = fakeModel(script, modelId))
      },
    },
    rasterizePdf: async () => [PNG],
    sleep: async () => {},
  })

async function queuedPdf() {
  const bytes = await makeTextPdf([['Receipt R-77 total 42.00']])
  const [b] = await testDb.db.insert(batch).values({ userId: dana, source: 'upload' }).returning()
  const [doc] = await testDb.db
    .insert(document)
    .values({
      userId: dana,
      batchId: b!.id,
      source: 'upload',
      name: 'receipt.pdf',
      status: 'queued',
      format: 'pdf',
      mimeType: MIME_TYPES.pdf,
      sizeBytes: bytes.length,
    })
    .returning()
  const key = storageKeyFor(dana, doc!.id)
  await testStorage.storage.write(key, bytes, MIME_TYPES.pdf)
  await testDb.db.update(document).set({ storageKey: key }).where(eq(document.id, doc!.id))
  return doc!
}

const receiptFields = [
  { key: 'receipt_number', label: 'Receipt number', description: 'The number printed after "Receipt"', type: 'text', required: true },
  { key: 'amount_paid', label: 'Amount paid', description: 'Total paid', type: 'money', required: true },
]

describe('a custom Template', () => {
  it('used through a job with its templateId, produces Invoices with its Fields', async () => {
    const receipts = await createTemplate(testDb.db, dana, { name: 'Receipts', fields: receiptFields })
    const doc = await queuedPdf()
    script = [reply({ invoices: [{ receipt_number: 'R-77', amount_paid: { amount: 42, currency: 'EUR' } }] })]

    expect(await runner().process({ documentId: doc.id, templateId: receipts.id })).toEqual({ kind: 'done' })

    const [extraction] = await listExtractions(testDb.db, dana, doc.id)
    expect(extraction).toMatchObject({ templateId: receipts.id, templateName: 'Receipts' })
    expect(extraction!.templateSnapshot.fields.map((f) => f.key)).toEqual(['receipt_number', 'amount_paid'])
    const [invoice] = await listInvoices(testDb.db, dana, extraction!.id)
    expect(invoice!.rawValues).toEqual({ receipt_number: 'R-77', amount_paid: { amount: 42, currency: 'EUR' } })
    // The model was asked for this Template's Fields, with their descriptions as instructions.
    const call = JSON.stringify(lastModel!.doGenerateCalls[0])
    expect(call).toContain('The number printed after')
    expect(call).not.toContain('invoice_number')
  })

  it('edited after an Extraction leaves the old Invoices rendering from their snapshot', async () => {
    const mine = (await cloneTemplate(testDb.db, dana, DEFAULT_TEMPLATE_ID))!
    const doc = await queuedPdf()
    const values = Object.fromEntries(
      mine.fields.map((f) => [
        f.key,
        f.type === 'list' ? [] : f.type === 'object' ? Object.fromEntries(f.fields.map((g) => [g.key, null])) : null,
      ]),
    )
    script = [reply({ invoices: [{ ...values, invoice_number: 'INV-9', total: 42 }] })]
    await runner().process({ documentId: doc.id, templateId: mine.id })

    // Rename one Field, remove the rest.
    await updateTemplate(testDb.db, dana, mine.id, {
      name: 'Slimmed',
      fields: [{ key: 'invoice_no', label: 'Invoice no.', description: '', type: 'text', required: true }],
    })

    const [extraction] = await listExtractions(testDb.db, dana, doc.id)
    expect(extraction!.templateName).toBe('Invoice (default) (copy)')
    const snapshotKeys = extraction!.templateSnapshot.fields.map((f) => f.key)
    expect(snapshotKeys).toContain('invoice_number')
    expect(snapshotKeys).toContain('total')
    expect(snapshotKeys).not.toContain('invoice_no')
    const [invoice] = await listInvoices(testDb.db, dana, extraction!.id)
    expect(invoice!.rawValues).toMatchObject({ invoice_number: 'INV-9', total: 42 })
  })
})
