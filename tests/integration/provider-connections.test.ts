import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { user } from '../../server/db/schema'
import { createProviderConnections, type ProviderConnections } from '../../server/lib/provider-connections'
import type { ProviderKind } from '../../server/domain/provider-presets'
import { startTestDatabase, type TestDatabase } from './support/database'
import { createFakeProviderHttp, type FakeProviderHttp } from './support/fake-provider-http'

const encryptionKey = Buffer.from('ab'.repeat(32), 'hex')

let testDb: TestDatabase
let http: FakeProviderHttp
let connections: ProviderConnections

async function createUser(id: string) {
  await testDb.db.insert(user).values({ id, name: id, email: `${id}@example.com` })
  return id
}

beforeAll(async () => {
  testDb = await startTestDatabase()
  await createUser('alice')
  await createUser('bob')
})

afterAll(async () => {
  await testDb?.stop()
})

beforeEach(() => {
  http = createFakeProviderHttp()
  connections = createProviderConnections({ db: testDb.db, encryptionKey, fetch: http.fetch })
})

/** Everything stored for provider connections, as one string. */
async function storedProviderData(): Promise<string> {
  const rows = await testDb.db.execute(sql`select * from provider_connection`)
  return JSON.stringify(rows.rows)
}

interface PresetCase {
  kind: ProviderKind
  baseUrl?: string
  apiKey?: string
  model: string
  chatPath: RegExp
}

const presets: PresetCase[] = [
  { kind: 'openai', model: 'gpt-4.1-mini', chatPath: /api\.openai\.com\/v1\/responses$/ },
  { kind: 'anthropic', model: 'claude-sonnet-4-5', chatPath: /api\.anthropic\.com\/v1\/messages$/ },
  {
    kind: 'google',
    model: 'gemini-2.5-flash',
    chatPath: /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-2\.5-flash:generateContent$/,
  },
  { kind: 'mistral', model: 'mistral-medium-latest', chatPath: /api\.mistral\.ai\/v1\/chat\/completions$/ },
  { kind: 'openrouter', model: 'google/gemini-2.5-flash', chatPath: /openrouter\.ai\/api\/v1\/chat\/completions$/ },
  {
    kind: 'ollama',
    apiKey: '',
    baseUrl: 'http://ollama:11434',
    model: 'llama3.1:8b',
    chatPath: /ollama:11434\/v1\/chat\/completions$/,
  },
  {
    kind: 'openai-compatible',
    baseUrl: 'https://llm.example.com/v1',
    model: 'my-model',
    chatPath: /llm\.example\.com\/v1\/chat\/completions$/,
  },
]

describe.each(presets)('a $kind Provider Connection', (preset) => {
  const apiKey = () => preset.apiKey ?? http.validKey

  it('can be added, tested, edited and deleted', async () => {
    const created = await connections.create('alice', {
      kind: preset.kind,
      name: `My ${preset.kind}`,
      apiKey: apiKey(),
      baseUrl: preset.baseUrl,
      defaultModel: preset.model,
    })
    expect(created).toMatchObject({ kind: preset.kind, name: `My ${preset.kind}`, status: 'ok' })
    expect(JSON.stringify(created)).not.toContain(http.validKey)

    const result = await connections.test('alice', created.id)
    expect(result).toEqual({ ok: true, model: preset.model })
    expect(http.requests.at(-1)?.url).toMatch(preset.chatPath)

    const edited = await connections.update('alice', created.id, { name: 'Renamed' })
    expect(edited?.name).toBe('Renamed')
    expect((await connections.test('alice', created.id)).ok).toBe(true)

    expect(await connections.remove('alice', created.id)).toBe(true)
    expect(await connections.list('alice')).toEqual([])
  })

  it('never stores the API key in plaintext', async () => {
    if (!apiKey()) return
    const created = await connections.create('alice', {
      kind: preset.kind,
      name: 'Secret',
      apiKey: apiKey(),
      baseUrl: preset.baseUrl,
      defaultModel: preset.model,
    })
    const stored = await storedProviderData()
    expect(stored).not.toContain(http.validKey)
    expect(stored).toContain('••••1234')
    await connections.remove('alice', created.id)
  })
})

describe('Provider Connections', () => {
  it('shows only a masked key', async () => {
    const created = await connections.create('alice', {
      kind: 'openai',
      name: 'OpenAI',
      apiKey: 'sk-live-supersecret-9876',
    })
    expect(created.apiKeyHint).toBe('••••9876')
    expect(await connections.list('alice')).toEqual([created])
    expect(JSON.stringify(await connections.list('alice'))).not.toContain('supersecret')
    await connections.remove('alice', created.id)
  })

  it("reports a rejected key as unauthorized and marks the connection broken", async () => {
    const created = await connections.create('alice', { kind: 'anthropic', name: 'A', apiKey: 'sk-wrong-key-0000' })
    const result = await connections.test('alice', created.id, 'claude-sonnet-4-5')
    expect(result).toMatchObject({ ok: false, reason: 'unauthorized' })
    expect((await connections.get('alice', created.id))?.status).toBe('broken')
  })

  it('clears the broken state when the key is replaced', async () => {
    const created = await connections.create('alice', { kind: 'openai', name: 'B', apiKey: 'sk-live-x-1111' })
    await connections.markBroken(created.id, 'The provider rejected the API key (401).')
    expect(await connections.get('alice', created.id)).toMatchObject({
      status: 'broken',
      statusMessage: 'The provider rejected the API key (401).',
    })

    const fixed = await connections.update('alice', created.id, { apiKey: http.validKey })
    expect(fixed).toMatchObject({ status: 'ok', statusMessage: null, apiKeyHint: '••••1234' })
    expect((await connections.test('alice', created.id, 'gpt-4.1-mini')).ok).toBe(true)
  })

  it('reports an unreachable host', async () => {
    const created = await connections.create('alice', {
      kind: 'ollama',
      name: 'Local',
      baseUrl: 'http://ollama:11434',
      defaultModel: 'llama3.1:8b',
    })
    http.unreachable = true
    expect(await connections.test('alice', created.id)).toMatchObject({ ok: false, reason: 'unreachable' })
    expect((await connections.get('alice', created.id))?.status).toBe('ok')
  })

  it('needs a model to test', async () => {
    const created = await connections.create('alice', {
      kind: 'openai-compatible',
      name: 'Compat',
      baseUrl: 'https://llm.example.com/v1',
    })
    expect(await connections.test('alice', created.id)).toMatchObject({ ok: false, reason: 'no-model' })
  })

  it('rejects an OpenAI-compatible connection without a base URL', async () => {
    await expect(connections.create('alice', { kind: 'openai-compatible', name: 'X' })).rejects.toThrow(/base URL/)
  })

  it('rejects a missing API key for a preset that needs one', async () => {
    await expect(connections.create('alice', { kind: 'mistral', name: 'X' })).rejects.toThrow(/API key/)
  })

  it("keeps each User's connections private", async () => {
    const created = await connections.create('alice', { kind: 'openai', name: 'Mine', apiKey: http.validKey })
    expect(await connections.get('bob', created.id)).toBeNull()
    expect(await connections.update('bob', created.id, { name: 'Stolen' })).toBeNull()
    expect(await connections.remove('bob', created.id)).toBe(false)
    expect((await connections.test('bob', created.id, 'gpt-4.1-mini')).ok).toBe(false)
    expect(await connections.list('bob')).toEqual([])
  })
})

describe('model lists', () => {
  it.each([
    ['openai', undefined, ['model-a', 'model-b'], /api\.openai\.com\/v1\/models$/],
    ['anthropic', undefined, ['model-a', 'model-b'], /api\.anthropic\.com\/v1\/models/],
    ['google', undefined, ['gemini-2.5-flash'], /generativelanguage\.googleapis\.com\/v1beta\/models/],
    ['mistral', undefined, ['model-a', 'model-b'], /api\.mistral\.ai\/v1\/models$/],
    ['openrouter', undefined, ['model-a', 'model-b'], /openrouter\.ai\/api\/v1\/models$/],
    ['ollama', 'http://ollama:11434', ['llama3.1:8b', 'llava:13b'], /ollama:11434\/api\/tags$/],
    ['openai-compatible', 'https://llm.example.com/v1', ['model-a', 'model-b'], /llm\.example\.com\/v1\/models$/],
  ] as const)('are fetched from %s', async (kind, baseUrl, expected, listUrl) => {
    const created = await connections.create('alice', {
      kind,
      name: kind,
      apiKey: kind === 'ollama' ? undefined : http.validKey,
      baseUrl,
    })
    expect(await connections.listModels('alice', created.id)).toEqual({ ok: true, models: expected })
    expect(http.requests.at(-1)?.url).toMatch(listUrl)
  })

  it('fall back to free text when the provider cannot list models', async () => {
    const created = await connections.create('alice', {
      kind: 'openai-compatible',
      name: 'No list',
      baseUrl: 'https://llm.example.com/v1',
      apiKey: 'sk-wrong-key-0000',
    })
    expect(await connections.listModels('alice', created.id)).toMatchObject({ ok: false, models: [] })
  })
})

describe('checking credentials before saving', () => {
  it('lists the models a working key can use', async () => {
    const before = await connections.list('alice')
    const result = await connections.checkCredentials('alice', { kind: 'openai', apiKey: http.validKey })
    expect(result).toEqual({ ok: true, models: ['model-a', 'model-b'] })
    expect(http.requests.at(-1)?.url).toMatch(/api\.openai\.com\/v1\/models$/)
    expect(await connections.list('alice')).toEqual(before)
  })

  it('reports a rejected key as unauthorized', async () => {
    expect(await connections.checkCredentials('alice', { kind: 'anthropic', apiKey: 'sk-wrong-key-0000' })).toEqual({
      ok: false,
      models: [],
      reason: 'unauthorized',
      message: 'The provider rejected the API key (401).',
    })
  })

  it("uses the saved key of the User's connection when the key field is left empty", async () => {
    const saved = await connections.create('alice', { kind: 'mistral', name: 'Saved', apiKey: http.validKey })
    expect(await connections.checkCredentials('alice', { kind: 'mistral', connectionId: saved.id })).toEqual({
      ok: true,
      models: ['model-a', 'model-b'],
    })
    expect(await connections.checkCredentials('bob', { kind: 'mistral', connectionId: saved.id })).toMatchObject({
      ok: false,
      reason: 'not-found',
    })
  })
})

describe('model settings', () => {
  it('start from the built-in Model Capability table and accept overrides and prices', async () => {
    const created = await connections.create('alice', {
      kind: 'ollama',
      name: 'Local',
      baseUrl: 'http://ollama:11434',
    })
    expect(await connections.modelSetting('alice', created.id, 'llama3.1:8b')).toEqual({
      modelId: 'llama3.1:8b',
      builtInCapability: 'text',
      capabilityOverride: null,
      capability: 'text',
      price: null,
    })

    await connections.saveModelSetting('alice', created.id, 'llama3.1:8b', {
      capabilityOverride: 'images',
      price: { inputPerMillion: 0.5, outputPerMillion: 1.5 },
    })
    expect(await connections.modelSetting('alice', created.id, 'llama3.1:8b')).toEqual({
      modelId: 'llama3.1:8b',
      builtInCapability: 'text',
      capabilityOverride: 'images',
      capability: 'images',
      price: { inputPerMillion: 0.5, outputPerMillion: 1.5 },
    })
    expect(await connections.modelSettings('alice', created.id)).toHaveLength(1)

    await connections.saveModelSetting('alice', created.id, 'llama3.1:8b', { capabilityOverride: null, price: null })
    expect(await connections.modelSetting('alice', created.id, 'llama3.1:8b')).toMatchObject({
      capability: 'text',
      price: null,
    })
  })
})
