import { describe, expect, it } from 'vitest'
import {
  createDropboxProvider,
  createGoogleDriveProvider,
  SourceGrantRevokedError,
  type SourceProvider,
} from './source-providers'

const limits = { maxDocumentBytes: 1000, maxDocumentPages: 30 }
const now = new Date('2026-11-18T12:00:00Z')

interface Call {
  url: string
  method: string
  headers: Headers
  body: string
}

/** A fake HTTP server: each request is recorded and answered by the first matching route. */
function fakeFetch(routes: Record<string, (call: Call) => Response>) {
  const calls: Call[] = []
  const fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input)
    const call: Call = {
      url,
      method: init.method ?? 'GET',
      headers: new Headers(init.headers),
      body: init.body == null ? '' : String(init.body),
    }
    calls.push(call)
    const route = Object.keys(routes).find((prefix) => `${call.method} ${url}`.startsWith(prefix))
    if (!route) return new Response('no route', { status: 599 })
    return routes[route]!(call)
  }
  return { fetch: fetch as typeof globalThis.fetch, calls }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

const googleApp = {
  clientId: 'drive-id',
  clientSecret: 'drive-secret',
  redirectUri: 'https://invoices.example.com/api/sources/google/callback',
}
const dropboxApp = {
  clientId: 'dbx-key',
  clientSecret: 'dbx-secret',
  redirectUri: 'https://invoices.example.com/api/sources/dropbox/callback',
}

function google(routes: Record<string, (call: Call) => Response>) {
  const http = fakeFetch(routes)
  return { provider: createGoogleDriveProvider(googleApp, { fetch: http.fetch, now: () => now }), calls: http.calls }
}

function dropbox(routes: Record<string, (call: Call) => Response>) {
  const http = fakeFetch(routes)
  return { provider: createDropboxProvider(dropboxApp, { fetch: http.fetch, now: () => now }), calls: http.calls }
}

describe('Google Drive', () => {
  it('asks for offline drive.file access, sending the User back to the callback with the state', () => {
    const { provider } = google({})
    const url = new URL(provider.authorizeUrl('state-123'))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'drive-id',
      redirect_uri: googleApp.redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.file',
      access_type: 'offline',
      prompt: 'consent',
      state: 'state-123',
    })
  })

  it('exchanges the code for tokens that expire after expires_in seconds', async () => {
    const { provider, calls } = google({
      'POST https://oauth2.googleapis.com/token': () =>
        json({ access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3599, token_type: 'Bearer' }),
    })
    const tokens = await provider.exchangeCode('code-1')
    expect(tokens).toEqual({
      accessToken: 'at-1',
      refreshToken: 'rt-1',
      expiresAt: new Date('2026-11-18T12:59:59Z'),
    })
    expect(Object.fromEntries(new URLSearchParams(calls[0]!.body))).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      client_id: 'drive-id',
      client_secret: 'drive-secret',
      redirect_uri: googleApp.redirectUri,
    })
  })

  it('refreshes an access token with the refresh token', async () => {
    const { provider, calls } = google({
      'POST https://oauth2.googleapis.com/token': () => json({ access_token: 'at-2', expires_in: 60 }),
    })
    expect(await provider.refresh('rt-1')).toEqual({
      accessToken: 'at-2',
      refreshToken: null,
      expiresAt: new Date('2026-11-18T12:01:00Z'),
    })
    expect(Object.fromEntries(new URLSearchParams(calls[0]!.body))).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'rt-1',
    })
  })

  it('reports a revoked grant distinctly, so the connection can be marked broken', async () => {
    const { provider } = google({
      'POST https://oauth2.googleapis.com/token': () =>
        json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400),
    })
    await expect(provider.refresh('rt-1')).rejects.toBeInstanceOf(SourceGrantRevokedError)
  })

  it('names the account by its email address', async () => {
    const { provider, calls } = google({
      'GET https://www.googleapis.com/drive/v3/about': () =>
        json({ user: { emailAddress: 'alice@gmail.com', displayName: 'Alice' } }),
    })
    expect(await provider.accountLabel('at-1')).toBe('alice@gmail.com')
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer at-1')
  })

  describe('downloading a picked file', () => {
    const files = 'GET https://www.googleapis.com/drive/v3/files/file-1'
    const meta = (body: object) => (call: Call) =>
      new URL(call.url).searchParams.get('alt') === 'media' ? new Response('unexpected download', { status: 500 }) : json(body)

    it('downloads the file content with the access token', async () => {
      const { provider, calls } = google({
        [files]: (call) =>
          new URL(call.url).searchParams.get('alt') === 'media'
            ? new Response('%PDF-1.7 bytes')
            : json({ mimeType: 'application/pdf', size: '14' }),
      })
      const result = await provider.download('at-1', 'file-1', limits)
      expect(result).toEqual({ ok: true, bytes: new TextEncoder().encode('%PDF-1.7 bytes') })
      expect(calls.every((c) => c.headers.get('authorization') === 'Bearer at-1')).toBe(true)
    })

    it('refuses a file over the size limit without downloading it', async () => {
      const { provider } = google({ [files]: meta({ mimeType: 'application/pdf', size: '5000' }) })
      expect(await provider.download('at-1', 'file-1', limits)).toEqual({
        ok: false,
        reason: expect.stringMatching(/limit/),
      })
    })

    it('stops reading a download that grows past the size limit', async () => {
      const { provider } = google({
        [files]: (call) =>
          new URL(call.url).searchParams.get('alt') === 'media'
            ? new Response('x'.repeat(1001))
            : json({ mimeType: 'application/pdf' }),
      })
      expect(await provider.download('at-1', 'file-1', limits)).toMatchObject({
        ok: false,
        reason: expect.stringMatching(/limit/),
      })
    })

    it('refuses Google Docs, Sheets and Slides, which have no file content', async () => {
      const { provider } = google({ [files]: meta({ mimeType: 'application/vnd.google-apps.document' }) })
      expect(await provider.download('at-1', 'file-1', limits)).toEqual({
        ok: false,
        reason: 'Google Docs, Sheets and Slides files cannot be added. Download the file as a PDF first.',
      })
    })

    it('explains a file the app cannot see', async () => {
      const { provider } = google({ [files]: () => json({ error: { code: 404 } }, 404) })
      expect(await provider.download('at-1', 'file-1', limits)).toEqual({
        ok: false,
        reason: 'The file was not found in Google Drive, or access to it was removed.',
      })
    })

    it('flags a rejected access token so the caller can refresh it', async () => {
      const { provider } = google({ [files]: () => json({ error: { code: 401 } }, 401) })
      expect(await provider.download('at-1', 'file-1', limits)).toMatchObject({ ok: false, tokenRejected: true })
    })
  })
})

describe('Google Drive: disconnecting', () => {
  it('revokes the refresh token, which ends every access token too', async () => {
    const { provider, calls } = google({ 'POST https://oauth2.googleapis.com/revoke': () => new Response('') })
    await provider.revoke({ accessToken: 'at-1', refreshToken: 'rt-1' })
    expect(Object.fromEntries(new URLSearchParams(calls[0]!.body))).toEqual({ token: 'rt-1' })
  })
})

describe('Dropbox', () => {
  it('asks for an offline (refreshable) grant, sending the User back to the callback with the state', () => {
    const { provider } = dropbox({})
    const url = new URL(provider.authorizeUrl('state-9'))
    expect(url.origin + url.pathname).toBe('https://www.dropbox.com/oauth2/authorize')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'dbx-key',
      redirect_uri: dropboxApp.redirectUri,
      response_type: 'code',
      token_access_type: 'offline',
      state: 'state-9',
    })
  })

  it('exchanges the code at the Dropbox token endpoint', async () => {
    const { provider, calls } = dropbox({
      'POST https://api.dropboxapi.com/oauth2/token': () =>
        json({ access_token: 'sl.at', refresh_token: 'rt', expires_in: 14400, account_id: 'dbid:1' }),
    })
    expect(await provider.exchangeCode('c')).toEqual({
      accessToken: 'sl.at',
      refreshToken: 'rt',
      expiresAt: new Date('2026-11-18T16:00:00Z'),
    })
    expect(new URLSearchParams(calls[0]!.body).get('client_secret')).toBe('dbx-secret')
  })

  it('names the account by its email address', async () => {
    const { provider, calls } = dropbox({
      'POST https://api.dropboxapi.com/2/users/get_current_account': () =>
        json({ email: 'alice@example.com', name: { display_name: 'Alice' } }),
    })
    expect(await provider.accountLabel('sl.at')).toBe('alice@example.com')
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer sl.at')
  })

  describe('downloading a chosen file', () => {
    const download = 'POST https://content.dropboxapi.com/2/files/download'

    it('downloads the file by its id', async () => {
      const { provider, calls } = dropbox({
        [download]: () =>
          new Response('%PDF-1.7', { headers: { 'dropbox-api-result': JSON.stringify({ size: 8 }) } }),
      })
      expect(await provider.download('sl.at', 'id:abc', limits)).toEqual({
        ok: true,
        bytes: new TextEncoder().encode('%PDF-1.7'),
      })
      expect(JSON.parse(calls[0]!.headers.get('dropbox-api-arg')!)).toEqual({ path: 'id:abc' })
      expect(calls[0]!.headers.get('authorization')).toBe('Bearer sl.at')
    })

    it('refuses a file whose declared size is over the limit', async () => {
      const { provider } = dropbox({
        [download]: () => new Response('x', { headers: { 'dropbox-api-result': JSON.stringify({ size: 5000 }) } }),
      })
      expect(await provider.download('sl.at', 'id:abc', limits)).toEqual({
        ok: false,
        reason: expect.stringMatching(/limit/),
      })
    })

    it('explains a file that is gone from the connected account', async () => {
      const { provider } = dropbox({
        [download]: () => json({ error_summary: 'path/not_found/..', error: { '.tag': 'path' } }, 409),
      })
      expect(await provider.download('sl.at', 'id:abc', limits)).toEqual({
        ok: false,
        reason: 'The file was not found in the connected Dropbox account. Pick files while signed in to Dropbox as that account.',
      })
    })

    it('flags a rejected access token so the caller can refresh it', async () => {
      const { provider } = dropbox({ [download]: () => json({ error_summary: 'expired_access_token/' }, 401) })
      expect(await provider.download('sl.at', 'id:abc', limits)).toMatchObject({ ok: false, tokenRejected: true })
    })
  })

  it('revokes the access token on disconnect', async () => {
    const { provider, calls } = dropbox({ 'POST https://api.dropboxapi.com/2/auth/token/revoke': () => json(null) })
    await provider.revoke({ accessToken: 'sl.at', refreshToken: 'rt' })
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer sl.at')
  })
})
