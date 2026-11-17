import { PgBoss } from 'pg-boss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { batch, document, providerConnection, user } from '../../server/db/schema'
import { createExtractionQueue } from '../../server/domain/extraction-queue'
import type { ExtractionRunner } from '../../server/domain/extraction/runner'
import { createReextraction } from '../../server/domain/review/rerun'
import { DEFAULT_TEMPLATE_ID } from '../../server/domain/template/default-template'
import { startWorker, type Worker } from '../../server/worker/start'
import { startTestDatabase, type TestDatabase } from './support/database'

let testDb: TestDatabase
let worker: Worker
let producer: PgBoss
const runner: ExtractionRunner = { process: vi.fn(async () => ({ kind: 'done' as const })) }
const alice = 'user-alice'

beforeAll(async () => {
  testDb = await startTestDatabase()
  await testDb.db.insert(user).values({ id: alice, name: 'Alice', email: 'alice@example.com' })
  worker = await startWorker({ databaseUrl: testDb.url, extraction: { runner, pollingIntervalSeconds: 0.5 } })
  producer = new PgBoss(testDb.url)
  await producer.start()
})

afterAll(async () => {
  await worker?.stop()
  await producer?.stop({ graceful: false })
  await testDb?.stop()
})

describe('Re-run through the queue', () => {
  it('hands the chosen Provider Connection, model and Template to the extraction runner', async () => {
    const [connection] = await testDb.db
      .insert(providerConnection)
      .values({ userId: alice, kind: 'ollama', name: 'Local' })
      .returning()
    const [b] = await testDb.db.insert(batch).values({ userId: alice, source: 'upload' }).returning()
    const [doc] = await testDb.db
      .insert(document)
      .values({ userId: alice, batchId: b!.id, source: 'upload', name: 'a.pdf', status: 'extracted', format: 'pdf' })
      .returning()
    const reextraction = createReextraction({ db: testDb.db, queue: await createExtractionQueue(producer) })

    await reextraction.rerun(alice, doc!.id, { connectionId: connection!.id, modelId: 'gpt-4.1', templateId: DEFAULT_TEMPLATE_ID })

    await vi.waitFor(() => expect(runner.process).toHaveBeenCalled(), { timeout: 15_000, interval: 200 })
    expect(runner.process).toHaveBeenCalledWith({
      documentId: doc!.id,
      connectionId: connection!.id,
      modelId: 'gpt-4.1',
      templateId: DEFAULT_TEMPLATE_ID,
    })
  })
})
