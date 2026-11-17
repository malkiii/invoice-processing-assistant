import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { user } from '../../server/db/schema'
import { getUserPreferences, updateUserPreferences } from '../../server/db/user-preferences'
import { createProviderConnections } from '../../server/lib/provider-connections'
import { startTestDatabase, type TestDatabase } from './support/database'

let testDb: TestDatabase

beforeAll(async () => {
  testDb = await startTestDatabase()
  await testDb.db.insert(user).values([
    { id: 'alice', name: 'alice', email: 'alice@example.com' },
    { id: 'bob', name: 'bob', email: 'bob@example.com' },
  ])
})

afterAll(async () => {
  await testDb?.stop()
})

const connections = () =>
  createProviderConnections({ db: testDb.db, encryptionKey: Buffer.alloc(32, 7), fetch: async () => new Response() })

describe('User preferences', () => {
  it('start with no defaults, the Noir theme and no auto-delete', async () => {
    expect(await getUserPreferences(testDb.db, 'alice')).toEqual({
      defaultConnectionId: null,
      defaultModel: null,
      defaultTemplateId: null,
      theme: 'noir',
      autoDeleteAfterDays: null,
    })
  })

  it('save a default Provider Connection and model, theme and auto-delete', async () => {
    const connection = await connections().create('alice', { kind: 'openai', name: 'OpenAI', apiKey: 'sk-1234567890' })
    const saved = await updateUserPreferences(testDb.db, 'alice', {
      defaultConnectionId: connection.id,
      defaultModel: 'gpt-4.1-mini',
      theme: 'day',
      autoDeleteAfterDays: 30,
    })
    expect(saved).toEqual({
      defaultConnectionId: connection.id,
      defaultModel: 'gpt-4.1-mini',
      defaultTemplateId: null,
      theme: 'day',
      autoDeleteAfterDays: 30,
    })
    expect(await getUserPreferences(testDb.db, 'alice')).toEqual(saved)
  })

  it("refuse another User's Provider Connection as a default", async () => {
    const theirs = await connections().create('alice', { kind: 'openai', name: 'Theirs', apiKey: 'sk-1234567890' })
    await expect(updateUserPreferences(testDb.db, 'bob', { defaultConnectionId: theirs.id })).rejects.toThrow(
      /Provider Connection/,
    )
  })

  it('forget the default when its Provider Connection is deleted', async () => {
    const service = connections()
    const connection = await service.create('bob', { kind: 'anthropic', name: 'A', apiKey: 'sk-1234567890' })
    await updateUserPreferences(testDb.db, 'bob', { defaultConnectionId: connection.id, defaultModel: 'claude-x' })
    await service.remove('bob', connection.id)
    expect((await getUserPreferences(testDb.db, 'bob')).defaultConnectionId).toBeNull()
  })

  it('reject a non-positive auto-delete period', async () => {
    await expect(updateUserPreferences(testDb.db, 'alice', { autoDeleteAfterDays: 0 })).rejects.toThrow()
  })
})
