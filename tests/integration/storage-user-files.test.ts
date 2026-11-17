import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createS3Storage } from '../../server/domain/storage'
import { storageKeyFor } from '../../server/domain/storage-keys'
import { createStorageUserFiles } from '../../server/domain/storage-user-files'
import { startTestStorage, type TestStorage } from './support/storage'

let testStorage: TestStorage

beforeAll(async () => {
  testStorage = await startTestStorage()
})

afterAll(async () => {
  await testStorage?.stop()
})

describe('deleting all of a User\'s files', () => {
  it("removes every object the User owns and leaves other Users' objects alone", async () => {
    const { storage } = testStorage
    const bytes = new Uint8Array([1, 2, 3])
    // More than one page of a ListObjectsV2 listing is not needed to prove the prefix logic.
    const aliceKeys = ['d1', 'd2', 'd3'].map((id) => storageKeyFor('alice', id))
    const bobKey = storageKeyFor('bob', 'd1')
    const aliceTwinKey = storageKeyFor('alice2', 'd1') // shares the "alice" prefix as a string
    for (const key of [...aliceKeys, bobKey, aliceTwinKey]) await storage.write(key, bytes, 'application/pdf')

    const files = createStorageUserFiles(storage)
    await files.deleteAllForUser('alice')

    for (const key of aliceKeys) expect(await storage.size(key), key).toBeNull()
    expect(await storage.size(bobKey)).toBe(3)
    expect(await storage.size(aliceTwinKey)).toBe(3)

    // Idempotent.
    await expect(files.deleteAllForUser('alice')).resolves.toBeUndefined()
  })
})

describe('storage health check', () => {
  it('passes when the bucket is reachable', async () => {
    await expect(testStorage.storage.check()).resolves.toBeUndefined()
  })

  it('fails when the bucket does not exist', async () => {
    const missing = createS3Storage({ ...testStorage.config, bucket: 'no-such-bucket' })
    await expect(missing.check()).rejects.toThrow()
  })
})
