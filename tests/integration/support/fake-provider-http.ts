/**
 * A fake `fetch` standing in for every LLM provider's HTTP API. It answers chat calls and
 * model-list calls in each provider's wire format, and rejects requests that do not carry
 * the expected API key with a 401, the way the real providers do.
 */
export interface RecordedRequest {
  method: string
  url: string
  headers: Headers
  body: unknown
}

export interface FakeProviderHttp {
  fetch: typeof fetch
  requests: RecordedRequest[]
  /** The API key the fake providers accept. Requests with any other key get a 401. */
  validKey: string
  /** Make every request fail as if the host were unreachable. */
  unreachable: boolean
}

const now = () => Math.floor(Date.now() / 1000)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function presentedKey(url: URL, headers: Headers): string | null {
  const bearer = headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return bearer ?? headers.get('x-api-key') ?? headers.get('x-goog-api-key') ?? url.searchParams.get('key')
}

function chatCompletion(model: string) {
  return {
    id: 'chatcmpl-1',
    object: 'chat.completion',
    created: now(),
    model,
    choices: [{ index: 0, message: { role: 'assistant', content: 'pong' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }
}

function openAiResponse(model: string) {
  return {
    id: 'resp_1',
    object: 'response',
    created_at: now(),
    status: 'completed',
    model,
    output: [
      {
        type: 'message',
        id: 'msg_1',
        status: 'completed',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'pong', annotations: [] }],
      },
    ],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  }
}

function anthropicMessage(model: string) {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model,
    content: [{ type: 'text', text: 'pong' }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  }
}

function geminiResponse() {
  return {
    candidates: [{ content: { role: 'model', parts: [{ text: 'pong' }] }, finishReason: 'STOP', index: 0 }],
    usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
  }
}

export function createFakeProviderHttp(validKey = 'sk-test-valid-key-1234'): FakeProviderHttp {
  const fake: FakeProviderHttp = {
    requests: [],
    validKey,
    unreachable: false,
    fetch: async (input, init) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      const text = request.method === 'GET' ? '' : await request.text()
      const body = text ? JSON.parse(text) : undefined
      fake.requests.push({ method: request.method, url: url.toString(), headers: request.headers, body })

      if (fake.unreachable) throw new TypeError('fetch failed')

      const isOllama = url.port === '11434'
      if (!isOllama && url.hostname !== 'no-auth.local' && presentedKey(url, request.headers) !== fake.validKey) {
        return json({ error: { message: 'Incorrect API key provided', type: 'invalid_request_error' } }, 401)
      }

      const path = url.pathname
      const model = (body as { model?: string } | undefined)?.model ?? 'unknown'

      // Chat calls
      if (path.endsWith('/responses')) return json(openAiResponse(model))
      if (path.endsWith('/chat/completions')) return json(chatCompletion(model))
      if (path.endsWith('/messages')) return json(anthropicMessage(model))
      if (path.endsWith(':generateContent')) return json(geminiResponse())

      // Model lists
      if (path.endsWith('/api/tags')) return json({ models: [{ name: 'llama3.1:8b' }, { name: 'llava:13b' }] })
      if (url.hostname === 'generativelanguage.googleapis.com' && path.endsWith('/models')) {
        return json({
          models: [
            { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
          ],
        })
      }
      if (path.endsWith('/models')) {
        return json({ object: 'list', data: [{ id: 'model-b' }, { id: 'model-a' }] })
      }

      return json({ error: { message: `Not found: ${path}` } }, 404)
    },
  }
  return fake
}
