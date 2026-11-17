/**
 * Server-side download of one URL for URL intake. Every hop of a redirect chain goes through the
 * SSRF guard: the URL is checked, its host resolved, every resolved address checked, and the
 * connection pinned to a checked address so DNS cannot change between check and connect.
 * Links in the response are never followed; only HTTP redirects are.
 */
import { checkSize, formatLimit, type DocumentLimits } from './document-inspection'
import { BLOCKED_ADDRESS, checkUrl, hostToResolve, isPublicAddress } from './ssrf-guard'

export interface ResolvedAddress {
  address: string
  family: 4 | 6
}

/** DNS lookup returning every address for a host name. */
export type Resolve = (hostname: string) => Promise<ResolvedAddress[]>

export interface HttpResponse {
  status: number
  headers: Headers
  body: AsyncIterable<Uint8Array>
  /** Stops the download and releases the connection. */
  cancel(): void
}

/**
 * Sends one GET for `url` to exactly `address` (TLS still verifies the certificate against the
 * URL's host name) and never follows redirects itself.
 */
export type HttpTransport = (request: { url: URL; address: ResolvedAddress; signal: AbortSignal }) => Promise<HttpResponse>

export type UrlFetchResult = { ok: true; bytes: Uint8Array; finalUrl: string } | { ok: false; reason: string }

export const MAX_REDIRECTS = 5
const DEFAULT_TIMEOUT_MS = 30_000
const TIMED_OUT = 'The server took too long to respond.'

class FetchRefused extends Error {}

async function addressFor(url: URL, resolve: Resolve): Promise<ResolvedAddress> {
  const host = hostToResolve(url)
  if (host === null) {
    const literal = url.hostname.replace(/^\[|\]$/g, '')
    return { address: literal, family: literal.includes(':') ? 6 : 4 }
  }
  let addresses: ResolvedAddress[]
  try {
    addresses = await resolve(host)
  } catch {
    throw new FetchRefused(`The host name ${host} could not be resolved.`)
  }
  if (addresses.length === 0) throw new FetchRefused(`The host name ${host} could not be resolved.`)
  // Refuse if any answer is non-public: an attacker controlling DNS chooses which one is used.
  if (!addresses.every((a) => isPublicAddress(a.address))) throw new FetchRefused(BLOCKED_ADDRESS)
  return addresses[0]!
}

async function readBody(response: HttpResponse, limits: DocumentLimits): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > 0) {
    const tooLarge = checkSize(declared, limits)
    if (tooLarge) {
      response.cancel()
      throw new FetchRefused(tooLarge)
    }
  }
  const chunks: Uint8Array[] = []
  let received = 0
  for await (const chunk of response.body) {
    received += chunk.length
    if (received > limits.maxDocumentBytes) {
      response.cancel()
      throw new FetchRefused(`File is larger than the ${formatLimit(limits.maxDocumentBytes)} limit.`)
    }
    chunks.push(chunk)
  }
  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

async function follow(
  raw: string,
  deps: { resolve: Resolve; transport: HttpTransport; limits: DocumentLimits; signal: AbortSignal },
): Promise<UrlFetchResult> {
  let next = raw
  for (let redirects = 0; ; redirects++) {
    const checked = checkUrl(next)
    if (!checked.ok) return checked
    const url = checked.url
    const address = await addressFor(url, deps.resolve)

    let response: HttpResponse
    try {
      response = await deps.transport({ url, address, signal: deps.signal })
    } catch (error) {
      if (deps.signal.aborted) throw error
      const detail = error instanceof Error ? error.message : String(error)
      return { ok: false, reason: `The URL could not be fetched (${detail}).` }
    }

    const location = response.headers.get('location')
    if (response.status >= 300 && response.status < 400 && location) {
      response.cancel()
      if (redirects >= MAX_REDIRECTS) {
        return { ok: false, reason: `Too many redirects (more than ${MAX_REDIRECTS}).` }
      }
      try {
        next = new URL(location, url).href
      } catch {
        return { ok: false, reason: 'The server redirected to an invalid URL.' }
      }
      continue
    }
    if (response.status < 200 || response.status >= 300) {
      response.cancel()
      return { ok: false, reason: `The server responded with HTTP ${response.status}.` }
    }
    return { ok: true, bytes: await readBody(response, deps.limits), finalUrl: url.href }
  }
}

/** Downloads `raw` within the size limit, or explains why it could not. Never throws for network errors. */
export async function fetchUrl(
  raw: string,
  deps: { resolve: Resolve; transport: HttpTransport; limits: DocumentLimits; timeoutMs?: number },
): Promise<UrlFetchResult> {
  const signal = AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    return await follow(raw, { ...deps, signal })
  } catch (error) {
    if (error instanceof FetchRefused) return { ok: false, reason: error.message }
    if (signal.aborted) return { ok: false, reason: TIMED_OUT }
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, reason: `The URL could not be fetched (${detail}).` }
  }
}
