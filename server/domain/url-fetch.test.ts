import { describe, expect, it } from 'vitest'
import { fetchUrl, type HttpResponse, type HttpTransport, type ResolvedAddress } from './url-fetch'

const limits = { maxDocumentBytes: 1024, maxDocumentPages: 30 }
const PUBLIC = '93.184.216.34'

/** A fake internet: DNS answers per host name, and a scripted response per URL. */
function internet(options: {
  dns: Record<string, string[]>
  pages: Record<string, () => HttpResponse>
}) {
  const contacted: { url: string; address: string }[] = []
  const resolve = async (hostname: string): Promise<ResolvedAddress[]> => {
    const answers = options.dns[hostname]
    if (!answers) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' })
    return answers.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))
  }
  const transport: HttpTransport = async ({ url, address }) => {
    contacted.push({ url: url.href, address: address.address })
    const page = options.pages[url.href]
    if (!page) return response(404, {})
    return page()
  }
  return { resolve, transport, contacted }
}

function response(status: number, headers: Record<string, string>, chunks: Uint8Array[] = []): HttpResponse {
  const state = { read: 0, cancelled: false }
  return {
    status,
    headers: new Headers(headers),
    body: (async function* () {
      for (const chunk of chunks) {
        state.read++
        yield chunk
      }
    })(),
    cancel: () => void (state.cancelled = true),
    ...{ state },
  }
}

const redirect = (location: string) => () => response(302, { location })
const ok = (bytes: string | Uint8Array) => () =>
  response(200, {}, [typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes])

describe('fetchUrl', () => {
  it('downloads a public https URL, connecting to the address it resolved and checked', async () => {
    const net = internet({
      dns: { 'example.com': [PUBLIC] },
      pages: { 'https://example.com/a.pdf': ok('%PDF-1.7') },
    })
    const result = await fetchUrl('https://example.com/a.pdf', { ...net, limits })
    expect(result).toEqual({
      ok: true,
      bytes: new TextEncoder().encode('%PDF-1.7'),
      finalUrl: 'https://example.com/a.pdf',
    })
    expect(net.contacted).toEqual([{ url: 'https://example.com/a.pdf', address: PUBLIC }])
  })

  it('refuses a host name that resolves to a private address, without connecting', async () => {
    const net = internet({ dns: { 'intranet.example': ['10.0.0.7'] }, pages: {} })
    const result = await fetchUrl('https://intranet.example/', { ...net, limits })
    expect(result).toEqual({ ok: false, reason: 'The address points to a private or reserved network.' })
    expect(net.contacted).toEqual([])
  })

  it('refuses a host name when any of its addresses is private (IPv6 included)', async () => {
    const net = internet({ dns: { 'mixed.example': [PUBLIC, '::1'] }, pages: {} })
    const result = await fetchUrl('https://mixed.example/', { ...net, limits })
    expect(result).toEqual({ ok: false, reason: 'The address points to a private or reserved network.' })
    expect(net.contacted).toEqual([])
  })

  it('blocks DNS rebinding via redirect: the redirect target is resolved and checked again', async () => {
    const net = internet({
      dns: { 'public.example': [PUBLIC], 'rebind.example': ['169.254.169.254'] },
      pages: { 'https://public.example/invoice': redirect('https://rebind.example/latest/meta-data/') },
    })
    const result = await fetchUrl('https://public.example/invoice', { ...net, limits })
    expect(result).toEqual({ ok: false, reason: 'The address points to a private or reserved network.' })
    expect(net.contacted.map((c) => c.url)).toEqual(['https://public.example/invoice'])
  })

  it.each([
    ['https://127.0.0.1/', 'a loopback IP literal'],
    ['https://2130706433/', 'a decimal IP literal'],
    ['https://0177.0.0.1/', 'an octal IP literal'],
    ['https://[::ffff:169.254.169.254]/', 'an IPv4-mapped IPv6 literal'],
  ])('blocks a redirect to %s (%s)', async (target) => {
    const net = internet({
      dns: { 'public.example': [PUBLIC] },
      pages: { 'https://public.example/': redirect(target) },
    })
    const result = await fetchUrl('https://public.example/', { ...net, limits })
    expect(result).toEqual({ ok: false, reason: 'The address points to a private or reserved network.' })
    expect(net.contacted).toHaveLength(1)
  })

  it('blocks a redirect that downgrades to http', async () => {
    const net = internet({
      dns: { 'public.example': [PUBLIC] },
      pages: { 'https://public.example/': redirect('http://public.example/') },
    })
    const result = await fetchUrl('https://public.example/', { ...net, limits })
    expect(result).toEqual({ ok: false, reason: 'Only https:// URLs can be imported.' })
  })

  it('follows up to 5 redirects, resolving relative locations', async () => {
    const pages: Record<string, () => HttpResponse> = {}
    for (let i = 0; i < 5; i++) pages[`https://public.example/${i}`] = redirect(`/${i + 1}`)
    pages['https://public.example/5'] = ok('<html><body>hi</body></html>')
    const net = internet({ dns: { 'public.example': [PUBLIC] }, pages })
    const result = await fetchUrl('https://public.example/0', { ...net, limits })
    expect(result).toMatchObject({ ok: true, finalUrl: 'https://public.example/5' })
    expect(net.contacted).toHaveLength(6)
  })

  it('gives up after the 5th redirect', async () => {
    const pages: Record<string, () => HttpResponse> = {}
    for (let i = 0; i < 6; i++) pages[`https://public.example/${i}`] = redirect(`/${i + 1}`)
    pages['https://public.example/6'] = ok('never reached')
    const net = internet({ dns: { 'public.example': [PUBLIC] }, pages })
    const result = await fetchUrl('https://public.example/0', { ...net, limits })
    expect(result).toEqual({ ok: false, reason: 'Too many redirects (more than 5).' })
    expect(net.contacted).toHaveLength(6)
  })

  it('rejects a declared Content-Length over the size limit before reading the body', async () => {
    const page = response(200, { 'content-length': '4096' }, [new Uint8Array(4096)])
    const net = internet({ dns: { 'public.example': [PUBLIC] }, pages: { 'https://public.example/big': () => page } })
    const result = await fetchUrl('https://public.example/big', { ...net, limits })
    expect(result).toEqual({ ok: false, reason: 'File is 4 KB; the limit is 1 KB.' })
    expect(page).toMatchObject({ state: { read: 0, cancelled: true } })
  })

  it('enforces the size limit while streaming, stopping at the first chunk past it', async () => {
    const chunks = Array.from({ length: 10 }, () => new Uint8Array(600))
    const page = response(200, {}, chunks) // no Content-Length, e.g. chunked encoding
    const net = internet({ dns: { 'public.example': [PUBLIC] }, pages: { 'https://public.example/big': () => page } })
    const result = await fetchUrl('https://public.example/big', { ...net, limits })
    expect(result).toEqual({ ok: false, reason: 'File is larger than the 1 KB limit.' })
    expect(page).toMatchObject({ state: { read: 2, cancelled: true } })
  })

  it('reports an error status from the server', async () => {
    const net = internet({ dns: { 'public.example': [PUBLIC] }, pages: {} })
    const result = await fetchUrl('https://public.example/missing', { ...net, limits })
    expect(result).toEqual({ ok: false, reason: 'The server responded with HTTP 404.' })
  })

  it('reports a host name that does not resolve', async () => {
    const net = internet({ dns: {}, pages: {} })
    const result = await fetchUrl('https://nowhere.example/', { ...net, limits })
    expect(result).toEqual({ ok: false, reason: 'The host name nowhere.example could not be resolved.' })
  })

  it('reports a connection failure', async () => {
    const net = internet({ dns: { 'public.example': [PUBLIC] }, pages: {} })
    const transport: HttpTransport = async () => {
      throw new Error('connect ECONNREFUSED')
    }
    const result = await fetchUrl('https://public.example/', { ...net, transport, limits })
    expect(result).toEqual({ ok: false, reason: 'The URL could not be fetched (connect ECONNREFUSED).' })
  })

  it('times out a server that never answers', async () => {
    const net = internet({ dns: { 'public.example': [PUBLIC] }, pages: {} })
    const transport: HttpTransport = ({ signal }) =>
      new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)))
    const result = await fetchUrl('https://public.example/', { ...net, transport, limits, timeoutMs: 20 })
    expect(result).toEqual({ ok: false, reason: 'The server took too long to respond.' })
  })
})
