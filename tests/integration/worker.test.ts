import { afterAll, beforeAll, expect, it } from 'vitest'
import { startWorker } from '../../server/worker/start'
import { startTestDatabase, type TestDatabase } from './support/database'

let testDb: TestDatabase

beforeAll(async () => {
  testDb = await startTestDatabase()
})

afterAll(async () => {
  await testDb?.stop()
})

it('connects to pg-boss, idles, and stops cleanly', async () => {
  const worker = await startWorker({ databaseUrl: testDb.url })
  // A round-trip through pg-boss proves its schema is installed and the connection works.
  await expect(worker.boss.getQueues()).resolves.toBeInstanceOf(Array)
  await worker.stop()
})
