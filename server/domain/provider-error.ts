/**
 * Reading errors from AI SDK model calls: the provider's own explanation for the User, and a
 * compact summary for the server log. Framework-free: the worker uses it too.
 */
import { APICallError, RetryError } from 'ai'

const MAX_DETAIL_LENGTH = 300
const MAX_LOGGED_BODY_LENGTH = 2_000

/** The last attempt's error when the AI SDK wrapped retries. */
export function unwrapRetry(error: unknown): unknown {
  return RetryError.isInstance(error) ? error.lastError : error
}

function messageIn(body: unknown): string | null {
  if (typeof body === 'string') return body
  if (!body || typeof body !== 'object') return null
  const record = body as Record<string, unknown>
  // OpenAI, Anthropic, Gemini, Mistral, OpenRouter: { error: { message } }. Ollama: { error: "..." }.
  // Others: { message } or { detail }.
  for (const key of ['error', 'message', 'detail']) {
    const found = messageIn(record[key])
    if (found) return found
  }
  return null
}

function parsedBody(responseBody: string | undefined): unknown {
  if (!responseBody) return undefined
  try {
    return JSON.parse(responseBody)
  } catch {
    return undefined
  }
}

/**
 * What the provider said went wrong, e.g. "The model `gpt-5x` does not exist", or null when the
 * error carries no provider explanation.
 */
export function providerErrorDetail(error: unknown): string | null {
  const cause = unwrapRetry(error)
  if (!APICallError.isInstance(cause)) return null
  const detail = messageIn(cause.data) ?? messageIn(parsedBody(cause.responseBody)) ?? cause.message
  const cleaned = detail?.replace(/\s+/g, ' ').trim()
  if (!cleaned) return null
  return cleaned.length > MAX_DETAIL_LENGTH ? `${cleaned.slice(0, MAX_DETAIL_LENGTH - 1)}…` : cleaned
}

/** Appends the provider's explanation to a User-facing message, when there is one. */
export function withProviderDetail(message: string, error: unknown): string {
  const detail = providerErrorDetail(error)
  return detail ? `${message.replace(/\.$/, '')}: ${detail}` : message
}

/**
 * The fields worth logging from a failed model call. Leaves out the request body: it holds the
 * whole Document (often base64) and must not end up in the logs.
 */
export function providerErrorLogFields(error: unknown): Record<string, unknown> {
  const cause = unwrapRetry(error)
  if (APICallError.isInstance(cause)) {
    return {
      statusCode: cause.statusCode,
      url: cause.url,
      message: cause.message,
      responseBody: cause.responseBody?.slice(0, MAX_LOGGED_BODY_LENGTH),
    }
  }
  if (cause instanceof Error) {
    const inner = cause.cause instanceof Error ? cause.cause.message : undefined
    return { name: cause.name, message: cause.message, ...(inner ? { cause: inner } : {}) }
  }
  return { error: String(cause) }
}
