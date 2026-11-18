import { APICallError, RetryError } from 'ai'
import { describe, expect, it } from 'vitest'
import { providerErrorDetail, providerErrorLogFields, withProviderDetail } from './provider-error'

function apiError(statusCode: number, responseBody?: string, data?: unknown) {
  return new APICallError({
    message: `HTTP ${statusCode}`,
    url: 'https://llm.test/v1/chat',
    requestBodyValues: { document: 'BASE64-DOCUMENT' },
    statusCode,
    responseBody,
    data,
  })
}

describe('providerErrorDetail', () => {
  it.each([
    ['OpenAI / Anthropic / Gemini', '{"error":{"message":"The model `gpt-5x` does not exist","type":"invalid_request_error"}}', 'The model `gpt-5x` does not exist'],
    ['Ollama', '{"error":"model \\"llama9\\" not found"}', 'model "llama9" not found'],
    ['message only', '{"message":"Rate limit exceeded"}', 'Rate limit exceeded'],
    ['detail only', '{"detail":"Bad request"}', 'Bad request'],
  ])('reads the provider message from a %s body', (_, body, expected) => {
    expect(providerErrorDetail(apiError(400, body))).toBe(expected)
  })

  it('prefers the parsed error data the AI SDK attached', () => {
    expect(providerErrorDetail(apiError(429, 'not json', { error: { message: 'You exceeded your quota' } }))).toBe(
      'You exceeded your quota',
    )
  })

  it('falls back to the error message when the body is not JSON', () => {
    expect(providerErrorDetail(apiError(502, '<html>Bad gateway</html>'))).toBe('HTTP 502')
  })

  it('looks inside retry errors', () => {
    const retry = new RetryError({ message: 'failed', reason: 'maxRetriesExceeded', errors: [apiError(500, '{"error":{"message":"overloaded"}}')] })
    expect(providerErrorDetail(retry)).toBe('overloaded')
  })

  it('caps long messages', () => {
    const detail = providerErrorDetail(apiError(400, JSON.stringify({ error: { message: 'x'.repeat(1000) } })))
    expect(detail!.length).toBeLessThanOrEqual(300)
  })

  it('has nothing to say about errors that are not provider responses', () => {
    expect(providerErrorDetail(new TypeError('fetch failed'))).toBeNull()
  })
})

describe('withProviderDetail', () => {
  it("appends the provider's explanation", () => {
    expect(withProviderDetail('The provider returned an error (404).', apiError(404, '{"error":{"message":"No such model"}}'))).toBe(
      'The provider returned an error (404): No such model',
    )
  })

  it('keeps the message when there is no explanation', () => {
    expect(withProviderDetail('Could not reach the provider.', new TypeError('fetch failed'))).toBe('Could not reach the provider.')
  })
})

describe('providerErrorLogFields', () => {
  it('logs the status, URL and response body but never the request body', () => {
    const fields = providerErrorLogFields(apiError(400, '{"error":{"message":"bad"}}'))
    expect(fields).toEqual({
      statusCode: 400,
      url: 'https://llm.test/v1/chat',
      message: 'HTTP 400',
      responseBody: '{"error":{"message":"bad"}}',
    })
    expect(JSON.stringify(fields)).not.toContain('BASE64-DOCUMENT')
  })

  it('logs plain errors with their cause', () => {
    expect(providerErrorLogFields(new TypeError('fetch failed', { cause: new Error('ECONNREFUSED') }))).toEqual({
      name: 'TypeError',
      message: 'fetch failed',
      cause: 'ECONNREFUSED',
    })
  })
})
