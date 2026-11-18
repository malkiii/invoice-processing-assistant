/**
 * The model call of an Extraction: `generateText` with `Output.object` over the compiled Template
 * schema, and the retry policy from the spec ("Extraction pipeline" step 4):
 * - 429 / 5xx / unreachable: up to 3 attempts with exponential backoff
 * - schema mismatch: one repair attempt that feeds the validation error back to the model
 * - 401 / 403: no retry; the caller marks the Provider Connection broken
 */
import {
  APICallError,
  generateText,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  RetryError,
  type LanguageModel,
  type ModelMessage,
} from 'ai'
import { providerErrorLogFields, withProviderDetail } from '../provider-error'
import type { InvoicesSchema } from '../template/compile'
import { isGroupField, type Field, type InvoiceValues } from '../template/fields'
import type { InputPart } from './input'

export interface TokenTotals {
  inputTokens: number
  outputTokens: number
}

export interface GeneratedInvoices {
  invoices: InvoiceValues[]
  usage: TokenTotals
}

/** The provider rejected the credentials. Never retried. */
export class ProviderUnauthorizedError extends Error {
  constructor(
    readonly statusCode: number,
    cause?: unknown,
  ) {
    super(withProviderDetail(`The provider rejected the API key (${statusCode}).`, cause))
    this.name = 'ProviderUnauthorizedError'
  }
}

/** The call failed for good. The message is shown to the User as the Document's failure reason. */
export class ExtractionCallError extends Error {
  constructor(
    message: string,
    readonly usage: TokenTotals = { inputTokens: 0, outputTokens: 0 },
  ) {
    super(message)
    this.name = 'ExtractionCallError'
  }
}

export interface GenerateInvoicesOptions {
  model: LanguageModel
  schema: InvoicesSchema
  /** The Template's Fields, described to the model in the system prompt. */
  fields: Field[]
  content: InputPart[]
  /** Injected so tests do not wait. */
  sleep?: (ms: number) => Promise<void>
  /** Per model call. */
  timeoutMs?: number
  /** Where failed model calls are logged. */
  log?: Pick<Console, 'error'>
}

export const MAX_ATTEMPTS = 3
const BACKOFF_BASE_MS = 2_000
const DEFAULT_TIMEOUT_MS = 5 * 60_000

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function fieldGuide(fields: Field[], indent = ''): string {
  return fields
    .map((field) => {
      const required = field.required ? ', required' : ''
      const choices = field.type === 'enum' ? ` One of: ${field.choices.join(', ')}.` : ''
      const line = `${indent}- ${field.key} (${field.type}${required}): ${field.label}. ${field.description}${choices}`
      return isGroupField(field) ? `${line}\n${fieldGuide(field.fields, `${indent}  `)}` : line
    })
    .join('\n')
}

export function systemPrompt(fields: Field[]): string {
  return [
    'You extract structured data from invoices.',
    'The user message contains one document. It may hold one invoice or several (for example a PDF with one invoice per page, or a statement bundling invoices).',
    'Return every distinct invoice as one element of "invoices", in the order they appear. Return an empty array if the document holds no invoice.',
    'Copy values exactly as printed; normalise dates to YYYY-MM-DD and amounts to plain numbers. Use null for any value that is not present. Never guess or compute values that are not printed.',
    '',
    'Fields to extract for each invoice:',
    fieldGuide(fields),
  ].join('\n')
}

function statusOf(error: unknown): number | undefined | 'none' {
  const cause = RetryError.isInstance(error) ? error.lastError : error
  if (APICallError.isInstance(cause)) return cause.statusCode
  return 'none'
}

function isRetryable(error: unknown): boolean {
  const status = statusOf(error)
  if (status === 'none') return error instanceof TypeError // fetch failed: network
  return status === undefined || status === 408 || status === 429 || status >= 500
}

function describeFailure(error: unknown): string {
  const status = statusOf(error)
  if (status === 'none') {
    if (error instanceof TypeError) return 'Could not reach the provider.'
    return `The model call failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500)
  }
  if (status === undefined) return 'Could not reach the provider.'
  return withProviderDetail(`The provider returned an error (${status}).`, error)
}

function addUsage(totals: TokenTotals, usage: { inputTokens?: number; outputTokens?: number } | undefined) {
  totals.inputTokens += usage?.inputTokens ?? 0
  totals.outputTokens += usage?.outputTokens ?? 0
}

function validationMessage(error: NoObjectGeneratedError): string {
  const cause = error.cause as { message?: string; cause?: { message?: string } } | undefined
  const detail = cause?.cause?.message ?? cause?.message ?? error.message
  return detail.slice(0, 4_000)
}

/**
 * Asks the model for the Invoices in a Document. Throws ProviderUnauthorizedError on 401/403,
 * ExtractionCallError on any other final failure.
 */
export async function generateInvoices(options: GenerateInvoicesOptions): Promise<GeneratedInvoices> {
  const { model, schema, fields, content } = options
  const sleep = options.sleep ?? defaultSleep
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const log = options.log ?? console
  const usage: TokenTotals = { inputTokens: 0, outputTokens: 0 }
  const instructions = systemPrompt(fields)

  async function call(messages: ModelMessage[]): Promise<{ invoices: InvoiceValues[]; usage: TokenTotals }> {
    for (let attempt = 1; ; attempt++) {
      let result
      try {
        result = await generateText({
          model,
          output: Output.object({ schema, name: 'invoices' }),
          instructions,
          messages,
          maxRetries: 0,
          temperature: 0,
          abortSignal: AbortSignal.timeout(timeoutMs),
        })
      } catch (error) {
        if (NoObjectGeneratedError.isInstance(error)) throw error
        log.error(`[extraction] model call failed (attempt ${attempt}/${MAX_ATTEMPTS})`, providerErrorLogFields(error))
        const status = statusOf(error)
        if (status === 401 || status === 403) throw new ProviderUnauthorizedError(status, error)
        if (!isRetryable(error) || attempt >= MAX_ATTEMPTS) {
          throw new ExtractionCallError(describeFailure(error), usage)
        }
        await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 250))
        continue
      }
      const callUsage = { inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0 }
      try {
        // `output` is a getter that throws when the model stopped without an answer (e.g. empty
        // response at the token limit); invalid JSON is thrown by generateText itself, above.
        return { invoices: result.output.invoices, usage: callUsage }
      } catch (error) {
        if (!NoOutputGeneratedError.isInstance(error)) throw error
        addUsage(usage, callUsage)
        throw new ExtractionCallError(`The model returned no answer (finish reason: ${result.finishReason}).`, usage)
      }
    }
  }

  const messages: ModelMessage[] = [{ role: 'user', content }]
  try {
    const result = await call(messages)
    addUsage(usage, result.usage)
    return { invoices: result.invoices, usage }
  } catch (error) {
    if (!NoObjectGeneratedError.isInstance(error)) throw error
    addUsage(usage, error.usage)
    // One repair attempt: show the model its answer and why it was rejected.
    const repair: ModelMessage[] = [
      ...messages,
      { role: 'assistant', content: error.text ?? '' },
      {
        role: 'user',
        content:
          `Your previous answer did not match the required JSON schema:\n${validationMessage(error)}\n\n` +
          'Reply again with the complete, corrected JSON object for the same document.',
      },
    ]
    try {
      const result = await call(repair)
      addUsage(usage, result.usage)
      return { invoices: result.invoices, usage }
    } catch (repairError) {
      if (!NoObjectGeneratedError.isInstance(repairError)) throw repairError
      addUsage(usage, repairError.usage)
      throw new ExtractionCallError(
        `The model's answer did not match the Template, even after a repair attempt: ${validationMessage(repairError).slice(0, 300)}`,
        usage,
      )
    }
  }
}
