/**
 * Adapter from a Provider Connection's decrypted credentials to the Vercel AI SDK and to each
 * provider's model-list endpoint. Framework-free: the worker uses it too.
 */
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createMistral } from '@ai-sdk/mistral'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { APICallError, generateText, RetryError, type LanguageModel } from 'ai'
import { withProviderDetail } from '../domain/provider-error'
import { PROVIDER_PRESETS, type ProviderKind } from '../domain/provider-presets'

/** Decrypted credentials. Never leaves the server. */
export interface ProviderCredentials {
  kind: ProviderKind
  apiKey: string | null
  baseUrl: string | null
}

type Fetch = typeof fetch

export function effectiveBaseUrl(credentials: ProviderCredentials): string {
  const url = credentials.baseUrl ?? PROVIDER_PRESETS[credentials.kind].defaultBaseUrl
  if (!url) throw new Error(`${PROVIDER_PRESETS[credentials.kind].label} needs a base URL`)
  return url.replace(/\/+$/, '')
}

export function createLanguageModel(
  credentials: ProviderCredentials,
  modelId: string,
  fetch: Fetch = globalThis.fetch,
): LanguageModel {
  const baseURL = effectiveBaseUrl(credentials)
  const apiKey = credentials.apiKey ?? undefined
  switch (credentials.kind) {
    case 'openai':
      return createOpenAI({ apiKey, baseURL, fetch })(modelId)
    case 'anthropic':
      return createAnthropic({ apiKey, baseURL, fetch })(modelId)
    case 'google':
      return createGoogleGenerativeAI({ apiKey, baseURL, fetch })(modelId)
    case 'mistral':
      return createMistral({ apiKey, baseURL, fetch })(modelId)
    case 'openrouter':
      return createOpenRouter({ apiKey, baseURL, fetch })(modelId)
    case 'ollama':
      return createOpenAICompatible({ name: 'ollama', baseURL: `${baseURL}/v1`, fetch })(modelId)
    case 'openai-compatible':
      return createOpenAICompatible({ name: 'openai-compatible', baseURL, apiKey, fetch })(modelId)
  }
}

export type ProviderFailureReason = 'unauthorized' | 'unreachable' | 'error'

export interface ProviderFailure {
  reason: ProviderFailureReason
  message: string
}

/** Turns an error from an AI SDK call or a model-list call into something a User can act on. */
export function classifyProviderError(error: unknown): ProviderFailure {
  const cause = RetryError.isInstance(error) ? error.lastError : error
  if (APICallError.isInstance(cause)) {
    if (cause.statusCode === 401 || cause.statusCode === 403) {
      return {
        reason: 'unauthorized',
        message: withProviderDetail(`The provider rejected the API key (${cause.statusCode}).`, cause),
      }
    }
    if (cause.statusCode === undefined) {
      return { reason: 'unreachable', message: 'Could not reach the provider.' }
    }
    return { reason: 'error', message: withProviderDetail(`The provider returned an error (${cause.statusCode}).`, cause) }
  }
  if (cause instanceof ProviderHttpError) {
    return cause.status === 401 || cause.status === 403
      ? { reason: 'unauthorized', message: `The provider rejected the API key (${cause.status}).` }
      : { reason: 'error', message: `The provider returned an error (${cause.status}).` }
  }
  if (cause instanceof TypeError) return { reason: 'unreachable', message: 'Could not reach the provider.' }
  return { reason: 'error', message: cause instanceof Error ? cause.message : 'Unknown error' }
}

/** Makes the smallest possible call to prove the credentials and model work. Throws on failure. */
export async function pingModel(credentials: ProviderCredentials, modelId: string, fetch?: Fetch): Promise<void> {
  await generateText({
    model: createLanguageModel(credentials, modelId, fetch),
    prompt: 'Reply with the single word: pong',
    // Some reasoning models reject a smaller output budget.
    maxOutputTokens: 16,
    maxRetries: 0,
    timeout: 30_000,
  })
}

class ProviderHttpError extends Error {
  constructor(readonly status: number) {
    super(`Provider returned HTTP ${status}`)
  }
}

async function getJson(fetch: Fetch, url: string, headers: Record<string, string>): Promise<any> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new ProviderHttpError(response.status)
  return response.json()
}

function bearer(apiKey: string | null): Record<string, string> {
  return apiKey ? { authorization: `Bearer ${apiKey}` } : {}
}

/** Fetches the provider's model ids, sorted. Throws when the provider cannot list them. */
export async function fetchModelIds(credentials: ProviderCredentials, fetch: Fetch = globalThis.fetch): Promise<string[]> {
  const base = effectiveBaseUrl(credentials)
  const { apiKey } = credentials
  let ids: string[]
  switch (credentials.kind) {
    case 'anthropic': {
      const body = await getJson(fetch, `${base}/models?limit=1000`, {
        'x-api-key': apiKey ?? '',
        'anthropic-version': '2023-06-01',
      })
      ids = body.data.map((m: { id: string }) => m.id)
      break
    }
    case 'google': {
      const body = await getJson(fetch, `${base}/models?pageSize=1000`, { 'x-goog-api-key': apiKey ?? '' })
      ids = body.models
        .filter((m: { supportedGenerationMethods?: string[] }) =>
          m.supportedGenerationMethods?.includes('generateContent'),
        )
        .map((m: { name: string }) => m.name.replace(/^models\//, ''))
      break
    }
    case 'ollama': {
      const body = await getJson(fetch, `${base}/api/tags`, {})
      ids = body.models.map((m: { name: string }) => m.name)
      break
    }
    case 'openai':
    case 'mistral':
    case 'openrouter':
    case 'openai-compatible': {
      const body = await getJson(fetch, `${base}/models`, bearer(apiKey))
      ids = body.data.map((m: { id: string }) => m.id)
      break
    }
  }
  return [...new Set(ids)].sort()
}
