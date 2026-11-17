import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { template, user } from '../../server/db/schema'
import { DEFAULT_TEMPLATE_ID } from '../../server/domain/template/default-template'
import { resolveTemplate } from '../../server/domain/templates'
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

  it('use the built-in default Template until the User picks another', async () => {
    const resolved = await resolveTemplate(testDb.db, 'alice', (await getUserPreferences(testDb.db, 'alice')).defaultTemplateId)
    expect(resolved).toMatchObject({ id: DEFAULT_TEMPLATE_ID, builtIn: true, name: 'Invoice (default)' })
    expect(resolved!.fields.map((f) => f.key)).toContain('line_items')
  })

  it("accept the User's own Template or the built-in one as the default, and refuse another User's", async () => {
    const fields = [{ key: 'total', label: 'Total', description: '', type: 'number' as const, required: true }]
    const [mine] = await testDb.db.insert(template).values({ userId: 'alice', name: 'Mine', fields }).returning()
    const [theirs] = await testDb.db.insert(template).values({ userId: 'bob', name: 'Theirs', fields }).returning()
    expect((await updateUserPreferences(testDb.db, 'alice', { defaultTemplateId: mine!.id })).defaultTemplateId).toBe(mine!.id)
    expect((await updateUserPreferences(testDb.db, 'alice', { defaultTemplateId: DEFAULT_TEMPLATE_ID })).defaultTemplateId).toBe(
      DEFAULT_TEMPLATE_ID,
    )
    await expect(updateUserPreferences(testDb.db, 'alice', { defaultTemplateId: theirs!.id })).rejects.toThrow(/Template/)
  })

  it('fall back to the built-in Template when the default Template is deleted', async () => {
    const fields = [{ key: 'total', label: 'Total', description: '', type: 'number' as const, required: true }]
    const [mine] = await testDb.db.insert(template).values({ userId: 'bob', name: 'Temp', fields }).returning()
    await updateUserPreferences(testDb.db, 'bob', { defaultTemplateId: mine!.id })
    await testDb.db.delete(template).where(eq(template.id, mine!.id))
    expect((await getUserPreferences(testDb.db, 'bob')).defaultTemplateId).toBeNull()
  })
})
