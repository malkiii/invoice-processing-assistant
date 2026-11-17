/** Production network adapters for url-fetch.ts: system DNS and node:https pinned to a checked address. */
import { lookup } from 'node:dns/promises'
import { request, type RequestOptions } from 'node:https'
import type { LookupFunction } from 'node:net'
import type { Readable } from 'node:stream'
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib'
import type { HttpTransport, Resolve } from './url-fetch'

export const resolveWithSystemDns: Resolve = async (hostname) => {
  const answers = await lookup(hostname, { all: true, verbatim: true })
  return answers.map((a) => ({ address: a.address, family: a.family === 6 ? 6 : 4 }))
}

function decoded(body: Readable, encoding: string | undefined): Readable {
  switch (encoding?.trim().toLowerCase()) {
    case 'gzip':
    case 'x-gzip':
      return body.pipe(createGunzip())
    case 'deflate':
      return body.pipe(createInflate())
    case 'br':
      return body.pipe(createBrotliDecompress())
    default:
      return body
  }
}

/**
 * GET over HTTPS to exactly the given address: the socket's DNS lookup is replaced so it can only
 * connect there, while SNI and certificate checks still use the URL's host name. Each request
 * opens its own connection, so no pooled socket to another address is ever reused.
 */
export function createHttpsTransport(options: { ca?: string | Buffer } = {}): HttpTransport {
  return ({ url, address, signal }) =>
    new Promise((resolve, reject) => {
      const pinned: LookupFunction = (_host, lookupOptions, callback) => {
        if (lookupOptions.all) callback(null, [{ address: address.address, family: address.family }])
        else callback(null, address.address, address.family)
      }
      const requestOptions: RequestOptions = {
        method: 'GET',
        agent: false,
        lookup: pinned,
        signal,
        ca: options.ca,
        headers: {
          accept: '*/*',
          'accept-encoding': 'gzip, deflate, br',
          'user-agent': 'InvoiceProcessingAssistant/1.0 (+document import)',
        },
      }
      const req = request(url, requestOptions, (res) => {
        const headers = new Headers()
        for (const [name, value] of Object.entries(res.headers)) {
          if (value === undefined) continue
          for (const v of Array.isArray(value) ? value : [value]) headers.append(name, v)
        }
        const body = decoded(res, headers.get('content-encoding') ?? undefined)
        if (body !== res) res.on('error', (error) => body.destroy(error))
        resolve({
          status: res.statusCode ?? 0,
          headers,
          body,
          cancel: () => {
            body.destroy()
            req.destroy()
          },
        })
      })
      req.on('error', reject)
      req.end()
    })
}
