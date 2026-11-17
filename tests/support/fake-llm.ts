/**
 * A scripted stand-in for an LLM (AI SDK LanguageModelV4). Each call consumes the next scripted
 * step: a reply (JSON text) or an HTTP error, so retry and repair paths can be driven exactly.
 */
import { APICallError } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'

type GenerateOptions = Parameters<MockLanguageModelV4['doGenerate']>[0]
type GenerateResult = Awaited<ReturnType<MockLanguageModelV4['doGenerate']>>

export type Step = GenerateResult | Error | ((options: GenerateOptions) => GenerateResult | Promise<GenerateResult>)

export function reply(value: unknown, tokens: { input?: number; output?: number } = {}): GenerateResult {
  return {
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: {
      inputTokens: { total: tokens.input ?? 10, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: tokens.output ?? 5, text: undefined, reasoning: undefined },
    },
    warnings: [],
  }
}

export function httpError(statusCode: number): APICallError {
  return new APICallError({
    message: `HTTP ${statusCode}`,
    url: 'https://llm.test/v1/chat',
    requestBodyValues: {},
    statusCode,
    responseBody: '{"error":"scripted"}',
    isRetryable: statusCode === 429 || statusCode >= 500,
  })
}

/** A model that plays `steps` in order; extra calls fail loudly. */
export function fakeModel(steps: Step[], modelId = 'fake-model'): MockLanguageModelV4 {
  let next = 0
  return new MockLanguageModelV4({
    modelId,
    doGenerate: async (options) => {
      const step = steps[next++]
      if (step === undefined) throw new Error(`fake model: unexpected call #${next}`)
      if (step instanceof Error) throw step
      return typeof step === 'function' ? step(options) : step
    },
  })
}

/** An Invoice for the built-in default Template with every value null, plus `values`. */
export function defaultTemplateInvoice(values: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    vendor: { name: null, address: null, tax_id: null },
    buyer: { name: null, address: null, tax_id: null },
    invoice_number: null,
    issue_date: null,
    due_date: null,
    currency: null,
    line_items: [],
    subtotal: null,
    tax_total: null,
    total: null,
    payment_terms: null,
    ...values,
  }
}
