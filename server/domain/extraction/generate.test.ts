import { APICallError } from 'ai'
import { describe, expect, it, vi } from 'vitest'
import { compileTemplate } from '../template/compile'
import type { Field } from '../template/fields'
import { ExtractionCallError, generateInvoices, ProviderUnauthorizedError } from './generate'
import { fakeModel, httpError, reply } from '../../../tests/support/fake-llm'

const fields: Field[] = [
  { key: 'invoice_number', label: 'Invoice number', description: 'The invoice id', type: 'text', required: true },
  { key: 'total', label: 'Total', description: 'Amount due', type: 'number', required: true },
]
const schema = compileTemplate(fields)
const content = [{ type: 'text' as const, text: 'Invoice A-1, total 10' }]
const noSleep = vi.fn(async () => {})

const silent = { error: () => {} }

const run = (model: ReturnType<typeof fakeModel>, sleep = noSleep, log: Pick<Console, 'error'> = silent) =>
  generateInvoices({ model, schema, fields, content, sleep, log })

describe('generateInvoices', () => {
  it('returns every Invoice the model found, with token usage', async () => {
    const model = fakeModel([reply({ invoices: [{ invoice_number: 'A-1', total: 10 }, { invoice_number: 'A-2', total: 5 }] }, { input: 120, output: 30 })])
    const result = await run(model)
    expect(result.invoices).toEqual([
      { invoice_number: 'A-1', total: 10 },
      { invoice_number: 'A-2', total: 5 },
    ])
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 30 })
  })

  it('puts the Field descriptions in the prompt and the Document in the user message', async () => {
    const model = fakeModel([reply({ invoices: [] })])
    await run(model)
    const prompt = JSON.stringify(model.doGenerateCalls[0]!.prompt)
    expect(prompt).toContain('invoice_number')
    expect(prompt).toContain('The invoice id')
    expect(prompt).toContain('Invoice A-1, total 10')
  })

  it('retries 429 and 5xx up to 3 attempts with exponential backoff', async () => {
    const sleep = vi.fn(async () => {})
    const model = fakeModel([httpError(429), httpError(503), reply({ invoices: [{ invoice_number: 'A-1', total: 10 }] })])
    const result = await run(model, sleep)
    expect(result.invoices).toHaveLength(1)
    expect(model.doGenerateCalls).toHaveLength(3)
    const delays = sleep.mock.calls.map((c) => (c as unknown as [number])[0])
    expect(delays).toHaveLength(2)
    expect(delays[1]!).toBeGreaterThan(delays[0]!)
  })

  it('gives up after 3 attempts with a readable error', async () => {
    const model = fakeModel([httpError(500), httpError(502), httpError(429), reply({ invoices: [] })])
    await expect(run(model)).rejects.toThrow(ExtractionCallError)
    await expect(run(fakeModel([httpError(500), httpError(500), httpError(500)]))).rejects.toThrow(/provider.*500/i)
    expect(model.doGenerateCalls).toHaveLength(3)
  })

  it('does not retry a 401 and reports it as unauthorized', async () => {
    const model = fakeModel([httpError(401), reply({ invoices: [] })])
    await expect(run(model)).rejects.toThrow(ProviderUnauthorizedError)
    expect(model.doGenerateCalls).toHaveLength(1)
  })

  it("shows the provider's own message and logs every failed call", async () => {
    const log = { error: vi.fn() }
    const model = fakeModel([httpError(503), httpError(404)])
    await expect(run(model, noSleep, log)).rejects.toThrow('The provider returned an error (404): scripted')
    expect(log.error).toHaveBeenCalledTimes(2)
    expect(log.error).toHaveBeenLastCalledWith(
      '[extraction] model call failed (attempt 2/3)',
      expect.objectContaining({ statusCode: 404, responseBody: '{"error":"scripted"}' }),
    )
  })

  it('includes the provider message when the key is rejected', async () => {
    await expect(run(fakeModel([httpError(401)]))).rejects.toThrow('The provider rejected the API key (401): scripted')
  })

  it('does not retry other client errors', async () => {
    const model = fakeModel([httpError(400), reply({ invoices: [] })])
    await expect(run(model)).rejects.toThrow(ExtractionCallError)
    expect(model.doGenerateCalls).toHaveLength(1)
  })

  it('makes one repair attempt on a schema mismatch, feeding back the validation error', async () => {
    const model = fakeModel([
      reply({ invoices: [{ invoice_number: 'A-1', total: 'ten' }] }, { input: 100, output: 10 }),
      reply({ invoices: [{ invoice_number: 'A-1', total: 10 }] }, { input: 150, output: 12 }),
    ])
    const result = await run(model)
    expect(result.invoices).toEqual([{ invoice_number: 'A-1', total: 10 }])
    expect(model.doGenerateCalls).toHaveLength(2)
    const repairPrompt = JSON.stringify(model.doGenerateCalls[1]!.prompt)
    expect(repairPrompt).toContain('ten')
    expect(repairPrompt).toMatch(/total/)
    expect(repairPrompt).toMatch(/did not match/i)
    // Both calls are billed.
    expect(result.usage).toEqual({ inputTokens: 250, outputTokens: 22 })
  })

  it('fails when the repair attempt still does not match the schema', async () => {
    const model = fakeModel([reply('not json at all'), reply({ invoices: [{ total: 'ten' }] }), reply({ invoices: [] })])
    await expect(run(model)).rejects.toThrow(/did not match the Template/i)
    expect(model.doGenerateCalls).toHaveLength(2)
  })
})
