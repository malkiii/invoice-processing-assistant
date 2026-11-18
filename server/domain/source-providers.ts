/**
 * Adapters for the external file stores behind Source Connections (ticket 12): the OAuth dance
 * and the file download, one per provider. Framework-free and stateless: tokens are stored and
 * refreshed by Source Connections (`server/lib/source-connections`).
 */
import { checkSize, formatLimit, type DocumentLimits } from './document-inspection'
import type { DocumentSource } from './documents'

export type SourceKind = Extract<DocumentSource, 'google-drive' | 'dropbox'>

export const SOURCE_KINDS = ['google-drive', 'dropbox'] as const satisfies readonly SourceKind[]

export const SOURCE_LABELS: Record<SourceKind, string> = { 'google-drive': 'Google Drive', dropbox: 'Dropbox' }

export function isSourceKind(value: unknown): value is SourceKind {
  return (SOURCE_KINDS as readonly unknown[]).includes(value)
}

/** An OAuth app registered with one provider for this instance, from the environment. */
export interface SourceOAuthApp {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface SourceTokens {
  accessToken: string
  /** Null when the provider did not issue one (refreshes keep the previous refresh token). */
  refreshToken: string | null
  /** Null when the access token does not expire. */
  expiresAt: Date | null
}

export type SourceDownload =
  | { ok: true; bytes: Uint8Array }
  /** `tokenRejected`: the access token was refused; refreshing it may help. */
  | { ok: false; reason: string; tokenRejected?: boolean }

export interface SourceProvider {
  kind: SourceKind
  /** The provider's consent screen; it sends the User back to the app's redirect URI with `state`. */
  authorizeUrl(state: string): string
  exchangeCode(code: string): Promise<SourceTokens>
  /** Throws SourceGrantRevokedError when the User revoked access or the refresh token expired. */
  refresh(refreshToken: string): Promise<SourceTokens>
  /** How the connected account is shown to the User (an email address or display name). */
  accountLabel(accessToken: string): Promise<string>
  /** Downloads one file the User picked, within the size limit. Never throws for HTTP failures. */
  download(accessToken: string, fileId: string, limits: DocumentLimits): Promise<SourceDownload>
  /** Ends the grant at the provider (on disconnect). Throws if the provider refuses. */
  revoke(tokens: { accessToken: string; refreshToken: string | null }): Promise<void>
}

interface ProviderDeps {
  fetch?: typeof globalThis.fetch
  now?: () => Date
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

/** Thrown when the provider refuses a call in a way the User cannot fix by retrying. */
export class SourceProviderError extends Error {}

/** The refresh token no longer works: the User must connect again. */
export class SourceGrantRevokedError extends SourceProviderError {}

function oauthClient(app: SourceOAuthApp, tokenUrl: string, deps: ProviderDeps) {
  const fetch = deps.fetch ?? globalThis.fetch
  const now = deps.now ?? (() => new Date())

  async function requestTokens(params: Record<string, string>): Promise<SourceTokens> {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ ...params, client_id: app.clientId, client_secret: app.clientSecret }).toString(),
    })
    const body = (await response.json().catch(() => ({}))) as TokenResponse
    if (body.error === 'invalid_grant') {
      throw new SourceGrantRevokedError(body.error_description ?? 'Access was revoked.')
    }
    if (!response.ok || !body.access_token) {
      throw new SourceProviderError(body.error_description ?? body.error ?? `HTTP ${response.status}`)
    }
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      expiresAt: body.expires_in ? new Date(now().getTime() + body.expires_in * 1000) : null,
    }
  }

  return {
    fetch,
    exchangeCode: (code: string) =>
      requestTokens({ grant_type: 'authorization_code', code, redirect_uri: app.redirectUri }),
    refresh: (refreshToken: string) => requestTokens({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  }
}

const bearer = (accessToken: string) => ({ authorization: `Bearer ${accessToken}` })

async function readJson<T>(response: Response, what: string): Promise<T> {
  if (!response.ok) throw new SourceProviderError(`${what} failed with HTTP ${response.status}`)
  return (await response.json()) as T
}

const TOKEN_REJECTED: SourceDownload = { ok: false, reason: 'The connection was refused.', tokenRejected: true }

/** Reads a response body, giving up as soon as it grows past the size limit. */
async function readLimited(response: Response, limits: DocumentLimits): Promise<SourceDownload> {
  const chunks: Uint8Array[] = []
  let received = 0
  const reader = response.body?.getReader()
  while (reader) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.length
    if (received > limits.maxDocumentBytes) {
      await reader.cancel().catch(() => {})
      return { ok: false, reason: `File is larger than the ${formatLimit(limits.maxDocumentBytes)} limit.` }
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return { ok: true, bytes }
}

export function createGoogleDriveProvider(app: SourceOAuthApp, deps: ProviderDeps = {}): SourceProvider {
  const client = oauthClient(app, 'https://oauth2.googleapis.com/token', deps)
  return {
    kind: 'google-drive',
    authorizeUrl(state) {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      url.search = new URLSearchParams({
        client_id: app.clientId,
        redirect_uri: app.redirectUri,
        response_type: 'code',
        // Only files the User picks in the Google Picker become visible to the app.
        scope: 'https://www.googleapis.com/auth/drive.file',
        access_type: 'offline',
        // Without it Google issues a refresh token only on the very first consent.
        prompt: 'consent',
        state,
      }).toString()
      return url.href
    },
    exchangeCode: client.exchangeCode,
    refresh: client.refresh,
    async accountLabel(accessToken) {
      const response = await client.fetch(
        'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)',
        { headers: bearer(accessToken) },
      )
      const { user } = await readJson<{ user?: { emailAddress?: string; displayName?: string } }>(
        response,
        'Reading the Google account',
      )
      return user?.emailAddress ?? user?.displayName ?? 'Google account'
    },
    async download(accessToken, fileId, limits) {
      const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`
      const failed = (response: Response): SourceDownload => {
        if (response.status === 401) return TOKEN_REJECTED
        if (response.status === 403 || response.status === 404) {
          return { ok: false, reason: 'The file was not found in Google Drive, or access to it was removed.' }
        }
        return { ok: false, reason: `Google Drive responded with HTTP ${response.status}.` }
      }

      const metaResponse = await client.fetch(`${url}?fields=mimeType,size&supportsAllDrives=true`, {
        headers: bearer(accessToken),
      })
      if (!metaResponse.ok) return failed(metaResponse)
      const meta = (await metaResponse.json()) as { mimeType?: string; size?: string }
      if (meta.mimeType?.startsWith('application/vnd.google-apps.')) {
        return {
          ok: false,
          reason: 'Google Docs, Sheets and Slides files cannot be added. Download the file as a PDF first.',
        }
      }
      const tooLarge = meta.size ? checkSize(Number(meta.size), limits) : null
      if (tooLarge) return { ok: false, reason: tooLarge }

      const response = await client.fetch(`${url}?alt=media&supportsAllDrives=true`, { headers: bearer(accessToken) })
      if (!response.ok) return failed(response)
      return readLimited(response, limits)
    },
    async revoke({ accessToken, refreshToken }) {
      const response = await client.fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken ?? accessToken }).toString(),
      })
      if (!response.ok) throw new SourceProviderError(`Google refused to revoke access (HTTP ${response.status}).`)
    },
  }
}

export function createDropboxProvider(app: SourceOAuthApp, deps: ProviderDeps = {}): SourceProvider {
  const client = oauthClient(app, 'https://api.dropboxapi.com/oauth2/token', deps)
  return {
    kind: 'dropbox',
    authorizeUrl(state) {
      const url = new URL('https://www.dropbox.com/oauth2/authorize')
      url.search = new URLSearchParams({
        client_id: app.clientId,
        redirect_uri: app.redirectUri,
        response_type: 'code',
        token_access_type: 'offline',
        state,
      }).toString()
      return url.href
    },
    exchangeCode: client.exchangeCode,
    refresh: client.refresh,
    async accountLabel(accessToken) {
      // An RPC endpoint without arguments: no body and no content type.
      const response = await client.fetch('https://api.dropboxapi.com/2/users/get_current_account', {
        method: 'POST',
        headers: bearer(accessToken),
      })
      const account = await readJson<{ email?: string; name?: { display_name?: string } }>(
        response,
        'Reading the Dropbox account',
      )
      return account.email ?? account.name?.display_name ?? 'Dropbox account'
    },
    async download(accessToken, fileId, limits) {
      const response = await client.fetch('https://content.dropboxapi.com/2/files/download', {
        method: 'POST',
        // The Chooser's file ids (`id:...`) are ASCII, so the JSON header needs no escaping.
        headers: { ...bearer(accessToken), 'dropbox-api-arg': JSON.stringify({ path: fileId }) },
      })
      if (response.status === 401) return TOKEN_REJECTED
      if (response.status === 409) {
        await response.body?.cancel().catch(() => {})
        // The Chooser browses whichever Dropbox account the browser is signed in to.
        return {
          ok: false,
          reason:
            'The file was not found in the connected Dropbox account. Pick files while signed in to Dropbox as that account.',
        }
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => {})
        return { ok: false, reason: `Dropbox responded with HTTP ${response.status}.` }
      }
      let declared: number | undefined
      try {
        declared = (JSON.parse(response.headers.get('dropbox-api-result') ?? '{}') as { size?: number }).size
      } catch {
        declared = undefined
      }
      const tooLarge = declared ? checkSize(declared, limits) : null
      if (tooLarge) {
        await response.body?.cancel().catch(() => {})
        return { ok: false, reason: tooLarge }
      }
      return readLimited(response, limits)
    },
    async revoke({ accessToken }) {
      const response = await client.fetch('https://api.dropboxapi.com/2/auth/token/revoke', {
        method: 'POST',
        headers: bearer(accessToken),
      })
      if (!response.ok) throw new SourceProviderError(`Dropbox refused to revoke access (HTTP ${response.status}).`)
    },
  }
}
