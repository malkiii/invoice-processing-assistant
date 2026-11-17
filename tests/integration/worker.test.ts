import { PgBoss } from 'pg-boss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { user } from '../../server/db/schema'
import { updateUserPreferences } from '../../server/db/user-preferences'
import { createDocumentLibrary } from '../../server/domain/document-library'
import { createExtractionQueue } from '../../server/domain/extraction-queue'
import { createExtractionRunner } from '../../server/domain/extraction/runner'
import { listExtractions, listInvoices } from '../../server/domain/extractions'
import { createIntake } from '../../server/domain/intake'
import { createProviderConnections } from '../../server/lib/provider-connections'
import { startWorker, type Worker } from '../../server/worker/start'
import { makeTextPdf, PNG } from '../fixtures/documents/make'
import { defaultTemplateInvoice, fakeModel, reply } from '../support/fake-llm'
import { startTestDatabase, type TestDatabase } from './support/database'
import { startTestStorage, type TestStorage } from './support/storage'

let testDb: TestDatabase
let testStorage: TestStorage
let worker: Worker
let producer: PgBoss

const alice = 'user-alice'

beforeAll(async () => {
  ;[testDb, testStorage] = await Promise.all([startTestDatabase(), startTestStorage()])
  await testDb.db.insert(user).values({ id: alice, name: 'Alice', email: 'alice@example.com' })
  const providers = createProviderConnections({ db: testDb.db, encryptionKey: Buffer.alloc(32, 2) })
  const connection = await providers.create(alice, { kind: 'anthropic', name: 'Claude', apiKey: 'sk-ant-test-0000' })
  await updateUserPreferences(testDb.db, alice, { defaultConnectionId: connection.id, defaultModel: 'claude-sonnet-4-5' })

  const runner = createExtractionRunner({
    db: testDb.db,
    storage: testStorage.storage,
    providers: {
      ...providers,
      languageModel: async () =>
        fakeModel([
          reply({
            invoices: [
              defaultTemplateInvoice({ invoice_number: 'INV-7', total: 70, currency: 'EUR' }),
              defaultTemplateInvoice({ invoice_number: 'INV-8', total: 80, currency: 'EUR' }),
            ],
          }),
        ]),
    },
    rasterizePdf: async () => [PNG],
  })
  worker = await startWorker({ databaseUrl: testDb.url, extraction: { runner, pollingIntervalSeconds: 0.5 } })
  producer = new PgBoss(testDb.url)
  await producer.start()
})

afterAll(async () => {
  await worker?.stop()
  await producer?.stop({ graceful: false })
  await Promise.all([testDb?.stop(), testStorage?.stop()])
})

describe('worker', () => {
  it('connects to pg-boss, idles, and stops cleanly', async () => {
    const idle = await startWorker({ databaseUrl: testDb.url })
    // A round-trip through pg-boss proves its schema is installed and the connection works.
    await expect(idle.boss.getQueues()).resolves.toBeInstanceOf(Array)
    await idle.stop()
  })

  it('extracts an uploaded PDF into Invoices once the upload is confirmed', async () => {
    const intake = createIntake({
      db: testDb.db,
      storage: testStorage.storage,
      queue: await createExtractionQueue(producer),
    })
    const library = createDocumentLibrary({ db: testDb.db, storage: testStorage.storage })
    const bytes = await makeTextPdf([['Invoice INV-7'], ['Invoice INV-8']])
    const started = await intake.startUploadBatch(alice, [{ name: 'two.pdf', size: bytes.length }])
    const doc = started.documents[0]!
    const put = await fetch(doc.upload!.url, { method: 'PUT', headers: doc.upload!.headers, body: bytes })
    expect(put.ok).toBe(true)
    await intake.confirmUpload(alice, doc.id)

    await vi.waitFor(async () => expect((await library.getDocument(alice, doc.id))!.status).toBe('extracted'), {
      timeout: 30_000,
      interval: 250,
    })
    const [extraction] = await listExtractions(testDb.db, alice, doc.id)
    const invoices = await listInvoices(testDb.db, alice, extraction!.id)
    expect(invoices.map((i) => i.rawValues.invoice_number)).toEqual(['INV-7', 'INV-8'])
  })
})
