import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:https'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHttpsTransport } from './https-transport'
import type { HttpResponse } from './url-fetch'

// Self-signed certificate for the name `invoices.test`, which no DNS server resolves.
const tls = join(import.meta.dirname, '../../tests/fixtures/tls')
const cert = readFileSync(join(tls, 'cert.pem'))
const key = readFileSync(join(tls, 'key.pem'))

let server: Server
let port: number
const loopback = { address: '127.0.0.1', family: 4 as const }

beforeAll(async () => {
  server = createServer({ cert, key }, (req, res) => {
    if (req.url === '/redirect') return void res.writeHead(302, { location: '/elsewhere' }).end()
    if (req.url === '/gzip') {
      return void res.writeHead(200, { 'content-encoding': 'gzip' }).end(gzipSync('%PDF-1.7 compressed'))
    }
    res.writeHead(200, { 'content-type': 'application/pdf' }).end('%PDF-1.7')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
})

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

async function text(response: HttpResponse) {
  const chunks: Uint8Array[] = []
  for await (const chunk of response.body) chunks.push(chunk)
  return Buffer.concat(chunks).toString()
}

const signal = () => AbortSignal.timeout(5000)

describe('createHttpsTransport', () => {
  it('connects to the pinned address while verifying TLS against the URL host name', async () => {
    const transport = createHttpsTransport({ ca: cert })
    const url = new URL(`https://invoices.test:${port}/a.pdf`)
    const response = await transport({ url, address: loopback, signal: signal() })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(await text(response)).toBe('%PDF-1.7')
  })

  it('returns redirects without following them', async () => {
    const transport = createHttpsTransport({ ca: cert })
    const url = new URL(`https://invoices.test:${port}/redirect`)
    const response = await transport({ url, address: loopback, signal: signal() })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/elsewhere')
    response.cancel()
  })

  it('decompresses a gzip body', async () => {
    const transport = createHttpsTransport({ ca: cert })
    const url = new URL(`https://invoices.test:${port}/gzip`)
    const response = await transport({ url, address: loopback, signal: signal() })
    expect(await text(response)).toBe('%PDF-1.7 compressed')
  })

  it('rejects a certificate that does not match the host name', async () => {
    const transport = createHttpsTransport({ ca: cert })
    const url = new URL(`https://other.test:${port}/a.pdf`)
    await expect(transport({ url, address: loopback, signal: signal() })).rejects.toThrow(/other\.test/)
  })

  it('rejects an untrusted certificate by default', async () => {
    const transport = createHttpsTransport()
    const url = new URL(`https://invoices.test:${port}/a.pdf`)
    await expect(transport({ url, address: loopback, signal: signal() })).rejects.toThrow(/self[- ]signed/i)
  })
})
