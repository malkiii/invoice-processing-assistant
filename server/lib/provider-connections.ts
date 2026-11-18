/**
 * Provider Connections (ADR 0003): a User's saved LLM credentials.
 * Keys are encrypted before they reach the database and are only decrypted here, to make a call.
 * Every read and write is scoped to the owning User. Framework-free: the worker uses it too.
 */
import { and, asc, eq } from 'drizzle-orm'
import type { LanguageModel } from 'ai'
import { decryptSecret, encryptSecret, maskSecret } from '../domain/crypto'
import type { ModelPrice } from '../domain/cost'
import { builtInModelCapability, type ModelCapability } from '../domain/model-capability'
import { isProviderKind, PROVIDER_PRESETS, type ProviderKind } from '../domain/provider-presets'
import type { Database } from '../db/client'
import { providerConnection, providerModelSetting, type ProviderConnectionStatus } from '../db/schema'
import {
  classifyProviderError,
  createLanguageModel,
  fetchModelIds,
  pingModel,
  type ProviderCredentials,
  type ProviderFailureReason,
} from './llm-providers'

/** What the browser may see of a Provider Connection. Never contains the key. */
export interface ProviderConnectionView {
  id: string
  kind: ProviderKind
  name: string
  apiKeyHint: string | null
  baseUrl: string | null
  defaultModel: string | null
  status: ProviderConnectionStatus
  statusMessage: string | null
  createdAt: Date
}

export interface NewProviderConnection {
  kind: ProviderKind
  name: string
  apiKey?: string | null
  baseUrl?: string | null
  defaultModel?: string | null
}

export interface ProviderConnectionChanges {
  name?: string
  /** A new key replaces the old one; omit (or send empty) to keep it. */
  apiKey?: string | null
  baseUrl?: string | null
  defaultModel?: string | null
}

export type ConnectionTestResult =
  | { ok: true; model: string }
  | { ok: false; reason: ProviderFailureReason | 'no-model' | 'not-found'; message: string }

export type ModelListResult =
  | { ok: true; models: string[] }
  | { ok: false; models: []; reason: ProviderFailureReason | 'not-found'; message: string }

/** Credentials typed into the Provider Connection form, before they are saved. */
export interface CredentialsCheck {
  kind: ProviderKind
  apiKey?: string | null
  baseUrl?: string | null
  /** When editing: an empty key field means "use this connection's saved key". */
  connectionId?: string | null
}

export interface ModelSettingView {
  modelId: string
  builtInCapability: ModelCapability
  capabilityOverride: ModelCapability | null
  capability: ModelCapability
  price: ModelPrice | null
}

export interface ModelSettingChanges {
  capabilityOverride?: ModelCapability | null
  price?: ModelPrice | null
}

export class ProviderConnectionInputError extends Error {}

const notFound = (): ModelListResult => ({ ok: false, models: [], reason: 'not-found', message: 'Provider Connection not found.' })

const viewColumns = {
  id: providerConnection.id,
  kind: providerConnection.kind,
  name: providerConnection.name,
  apiKeyHint: providerConnection.apiKeyHint,
  baseUrl: providerConnection.baseUrl,
  defaultModel: providerConnection.defaultModel,
  status: providerConnection.status,
  statusMessage: providerConnection.statusMessage,
  createdAt: providerConnection.createdAt,
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function validateBaseUrl(baseUrl: string | null) {
  if (!baseUrl) return
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new ProviderConnectionInputError('The base URL is not a valid URL')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ProviderConnectionInputError('The base URL must start with http:// or https://')
  }
}

export function createProviderConnections(deps: { db: Database; encryptionKey: Buffer; fetch?: typeof fetch }) {
  const { db, encryptionKey } = deps
  const fetch = deps.fetch ?? globalThis.fetch

  const owned = (userId: string, id: string) =>
    and(eq(providerConnection.userId, userId), eq(providerConnection.id, id))

  async function get(userId: string, id: string): Promise<ProviderConnectionView | null> {
    const [row] = await db.select(viewColumns).from(providerConnection).where(owned(userId, id))
    return row ?? null
  }

  async function credentials(userId: string, id: string) {
    const [row] = await db
      .select({
        kind: providerConnection.kind,
        encryptedApiKey: providerConnection.encryptedApiKey,
        baseUrl: providerConnection.baseUrl,
        defaultModel: providerConnection.defaultModel,
      })
      .from(providerConnection)
      .where(owned(userId, id))
    if (!row) return null
    const creds: ProviderCredentials = {
      kind: row.kind,
      apiKey: row.encryptedApiKey ? decryptSecret(row.encryptedApiKey, encryptionKey) : null,
      baseUrl: row.baseUrl,
    }
    return { creds, defaultModel: row.defaultModel }
  }

  function sealKey(apiKey: string) {
    return { encryptedApiKey: encryptSecret(apiKey, encryptionKey), apiKeyHint: maskSecret(apiKey) }
  }

  async function markBroken(id: string, message: string) {
    await db
      .update(providerConnection)
      .set({ status: 'broken', statusMessage: message })
      .where(eq(providerConnection.id, id))
  }

  async function markOk(id: string) {
    await db
      .update(providerConnection)
      .set({ status: 'ok', statusMessage: null })
      .where(eq(providerConnection.id, id))
  }

  async function modelList(creds: ProviderCredentials): Promise<ModelListResult> {
    try {
      return { ok: true, models: await fetchModelIds(creds, fetch) }
    } catch (error) {
      return { ok: false, models: [], ...classifyProviderError(error) }
    }
  }

  return {
    get,

    async list(userId: string): Promise<ProviderConnectionView[]> {
      return db
        .select(viewColumns)
        .from(providerConnection)
        .where(eq(providerConnection.userId, userId))
        .orderBy(asc(providerConnection.createdAt))
    },

    async create(userId: string, input: NewProviderConnection): Promise<ProviderConnectionView> {
      if (!isProviderKind(input.kind)) throw new ProviderConnectionInputError('Unknown provider')
      const preset = PROVIDER_PRESETS[input.kind]
      const name = clean(input.name) ?? preset.label
      const apiKey = clean(input.apiKey)
      const baseUrl = clean(input.baseUrl)
      if (preset.requiresApiKey && !apiKey) throw new ProviderConnectionInputError(`${preset.label} needs an API key`)
      if (preset.requiresBaseUrl && !baseUrl) throw new ProviderConnectionInputError(`${preset.label} needs a base URL`)
      validateBaseUrl(baseUrl)

      const [row] = await db
        .insert(providerConnection)
        .values({
          userId,
          kind: input.kind,
          name,
          baseUrl,
          defaultModel: clean(input.defaultModel) ?? preset.suggestedModel,
          ...(apiKey ? sealKey(apiKey) : {}),
        })
        .returning(viewColumns)
      return row!
    },

    async update(userId: string, id: string, changes: ProviderConnectionChanges): Promise<ProviderConnectionView | null> {
      const existing = await get(userId, id)
      if (!existing) return null
      const preset = PROVIDER_PRESETS[existing.kind]
      const set: Partial<typeof providerConnection.$inferInsert> = {}
      if (changes.name !== undefined) set.name = clean(changes.name) ?? preset.label
      if (changes.defaultModel !== undefined) set.defaultModel = clean(changes.defaultModel)
      if (changes.baseUrl !== undefined) {
        const baseUrl = clean(changes.baseUrl)
        if (preset.requiresBaseUrl && !baseUrl) throw new ProviderConnectionInputError(`${preset.label} needs a base URL`)
        validateBaseUrl(baseUrl)
        set.baseUrl = baseUrl
      }
      const apiKey = clean(changes.apiKey)
      if (apiKey) Object.assign(set, sealKey(apiKey))
      // New credentials may fix a broken connection; the next call or test will tell.
      if (apiKey || changes.baseUrl !== undefined) Object.assign(set, { status: 'ok', statusMessage: null })
      if (Object.keys(set).length === 0) return existing

      const [row] = await db.update(providerConnection).set(set).where(owned(userId, id)).returning(viewColumns)
      return row ?? null
    },

    async remove(userId: string, id: string): Promise<boolean> {
      const rows = await db.delete(providerConnection).where(owned(userId, id)).returning({ id: providerConnection.id })
      return rows.length > 0
    },

    /** Makes a tiny call with the stored credentials. A rejected key marks the connection broken. */
    async test(userId: string, id: string, modelId?: string | null): Promise<ConnectionTestResult> {
      const found = await credentials(userId, id)
      if (!found) return { ok: false, reason: 'not-found', message: 'Provider Connection not found.' }
      const model = clean(modelId) ?? found.defaultModel
      if (!model) return { ok: false, reason: 'no-model', message: 'Choose a model to test with.' }
      try {
        await pingModel(found.creds, model, fetch)
        await markOk(id)
        return { ok: true, model }
      } catch (error) {
        const failure = classifyProviderError(error)
        if (failure.reason === 'unauthorized') await markBroken(id, failure.message)
        return { ok: false, ...failure }
      }
    },

    async listModels(userId: string, id: string): Promise<ModelListResult> {
      const found = await credentials(userId, id)
      if (!found) return notFound()
      return modelList(found.creds)
    },

    /** Fetches the model list with credentials that are not saved yet, so the form can offer only working models. */
    async checkCredentials(userId: string, input: CredentialsCheck): Promise<ModelListResult> {
      let apiKey = clean(input.apiKey)
      if (!apiKey && input.connectionId) {
        const found = await credentials(userId, input.connectionId)
        if (!found) return notFound()
        apiKey = found.creds.apiKey
      }
      const baseUrl = clean(input.baseUrl)
      validateBaseUrl(baseUrl)
      return modelList({ kind: input.kind, apiKey, baseUrl })
    },

    /** For the worker or a server route making an LLM call. Returns null if the User does not own it. */
    async languageModel(userId: string, id: string, modelId: string): Promise<LanguageModel | null> {
      const found = await credentials(userId, id)
      return found ? createLanguageModel(found.creds, modelId, fetch) : null
    },

    /** Called by the worker when the provider answers 401; pauses that User's Extractions until fixed. */
    markBroken,

    async modelSettings(userId: string, id: string): Promise<ModelSettingView[]> {
      const connection = await get(userId, id)
      if (!connection) return []
      const rows = await db
        .select()
        .from(providerModelSetting)
        .where(eq(providerModelSetting.connectionId, id))
        .orderBy(asc(providerModelSetting.modelId))
      return rows.map((row) => toSettingView(connection.kind, row.modelId, row))
    },

    async modelSetting(userId: string, id: string, modelId: string): Promise<ModelSettingView | null> {
      const connection = await get(userId, id)
      if (!connection) return null
      const [row] = await db
        .select()
        .from(providerModelSetting)
        .where(and(eq(providerModelSetting.connectionId, id), eq(providerModelSetting.modelId, modelId)))
      return toSettingView(connection.kind, modelId, row)
    },

    async saveModelSetting(
      userId: string,
      id: string,
      modelId: string,
      changes: ModelSettingChanges,
    ): Promise<ModelSettingView | null> {
      const connection = await get(userId, id)
      const model = clean(modelId)
      if (!connection || !model) return null
      const set: Partial<typeof providerModelSetting.$inferInsert> = {}
      if (changes.capabilityOverride !== undefined) set.capabilityOverride = changes.capabilityOverride
      if (changes.price !== undefined) {
        const price = changes.price
        if (price && (!(price.inputPerMillion >= 0) || !(price.outputPerMillion >= 0))) {
          throw new ProviderConnectionInputError('Prices must be zero or more')
        }
        set.inputPricePerMillion = price?.inputPerMillion ?? null
        set.outputPricePerMillion = price?.outputPerMillion ?? null
      }
      await db
        .insert(providerModelSetting)
        .values({ connectionId: id, modelId: model, ...set })
        .onConflictDoUpdate({
          target: [providerModelSetting.connectionId, providerModelSetting.modelId],
          set: { ...set, updatedAt: new Date() },
        })
      return this.modelSetting(userId, id, model)
    },
  }
}

function toSettingView(
  kind: ProviderKind,
  modelId: string,
  row?: typeof providerModelSetting.$inferSelect,
): ModelSettingView {
  const builtInCapability = builtInModelCapability(kind, modelId)
  const capabilityOverride = row?.capabilityOverride ?? null
  const price =
    row?.inputPricePerMillion != null && row.outputPricePerMillion != null
      ? { inputPerMillion: row.inputPricePerMillion, outputPerMillion: row.outputPricePerMillion }
      : null
  return { modelId, builtInCapability, capabilityOverride, capability: capabilityOverride ?? builtInCapability, price }
}

export type ProviderConnections = ReturnType<typeof createProviderConnections>
