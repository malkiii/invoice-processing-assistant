import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { batch, document, user } from '../../server/db/schema'
import { listenToDocumentStatus, type DocumentStatusListener } from '../../server/domain/document-events'
import type { DocumentStatusEvent } from '../../server/domain/documents'
import { startTestDatabase, type TestDatabase } from './support/database'

let testDb: TestDatabase
let listener: DocumentStatusListener
const events: DocumentStatusEvent[] = []

beforeAll(async () => {
  testDb = await startTestDatabase()
  await testDb.db.insert(user).values({ id: 'u1', name: 'U', email: 'u@example.com' })
  listener = await listenToDocumentStatus(testDb.url)
  listener.subscribe((event) => events.push(event))
})

afterAll(async () => {
  await listener?.close()
  await testDb?.stop()
})

async function waitFor<T>(check: () => T | undefined, timeoutMs = 5000): Promise<T> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const value = check()
    if (value !== undefined) return value
    await new Promise((r) => setTimeout(r, 25))
  }
  throw new Error('timed out')
}

it('announces every Document status change, whoever makes it (app or worker)', async () => {
  const [b] = await testDb.db.insert(batch).values({ userId: 'u1', source: 'upload' }).returning()
  const [doc] = await testDb.db
    .insert(document)
    .values({ userId: 'u1', batchId: b!.id, source: 'upload', name: 'a.pdf', status: 'uploading' })
    .returning()

  await testDb.db.update(document).set({ status: 'failed', failureReason: 'Nope.' }).where(eq(document.id, doc!.id))

  const failed = await waitFor(() => events.find((e) => e.documentId === doc!.id && e.status === 'failed'))
  expect(failed).toEqual({
    documentId: doc!.id,
    batchId: b!.id,
    userId: 'u1',
    status: 'failed',
    failureReason: 'Nope.',
  })
  expect(events.filter((e) => e.documentId === doc!.id).map((e) => e.status)).toEqual(['uploading', 'failed'])
})

it('stays quiet when a Document changes without a status change', async () => {
  const before = events.length
  const [doc] = await testDb.db.select().from(document).limit(1)
  await testDb.db.update(document).set({ pageCount: 3 }).where(eq(document.id, doc!.id))
  await new Promise((r) => setTimeout(r, 300))
  expect(events.length).toBe(before)
})
