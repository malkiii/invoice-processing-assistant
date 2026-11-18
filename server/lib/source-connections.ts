/**
 * Source Connections (ticket 12): a User's authorised link to Google Drive or Dropbox.
 * Tokens are encrypted before they reach the database (as Provider Connection keys are,
 * ADR 0003) and only decrypted here, to call the provider. Every read and write is scoped to the
 * owning User. Framework-free: the worker uses it to download picked files.
 */
import { and, asc, eq } from 'drizzle-orm'
import type { Database } from '../db/client'
import { sourceConnection, type SourceConnectionStatus } from '../db/schema'
import { decryptSecret, encryptSecret } from '../domain/crypto'
import type { DocumentLimits } from '../domain/document-inspection'
import {
  createDropboxProvider,
  createGoogleDriveProvider,
  SOURCE_LABELS,
  SourceGrantRevokedError,
  type SourceDownload,
  type SourceKind,
  type SourceProvider,
  type SourceTokens,
} from '../domain/source-providers'
import type { SourcesConfig } from './config'

/** The adapters for every Source Connection provider this instance has configured. */
export function createSourceProviders(config: SourcesConfig): Partial<Record<SourceKind, SourceProvider>> {
  const drive = config['google-drive']
  return {
    ...(drive && { 'google-drive': createGoogleDriveProvider(drive) }),
    ...(config.dropbox && { dropbox: createDropboxProvider(config.dropbox) }),
  }
}

/** What the browser may see of a Source Connection. Never contains a token. */
export interface SourceConnectionView {
  kind: SourceKind
  accountLabel: string
  status: SourceConnectionStatus
  statusMessage: string | null
  connectedAt: Date
}

/** The connection cannot be used: not configured, not connected, or broken. The message says why. */
export class SourceConnectionUnavailableError extends Error {}

/** Access tokens this close to expiry are refreshed before use. */
const EXPIRY_MARGIN_MS = 60_000

const viewColumns = {
  kind: sourceConnection.kind,
  accountLabel: sourceConnection.accountLabel,
  status: sourceConnection.status,
  statusMessage: sourceConnection.statusMessage,
  connectedAt: sourceConnection.createdAt,
}

export function createSourceConnections(deps: {
  db: Database
  encryptionKey: Buffer
  /** The providers this instance has configured; others cannot be connected. */
  providers: Partial<Record<SourceKind, SourceProvider>>
  now?: () => Date
}) {
  const { db, encryptionKey } = deps
  const now = deps.now ?? (() => new Date())

  const owned = (userId: string, kind: SourceKind) =>
    and(eq(sourceConnection.userId, userId), eq(sourceConnection.kind, kind))

  function providerFor(kind: SourceKind): SourceProvider {
    const provider = deps.providers[kind]
    if (!provider) throw new SourceConnectionUnavailableError(`${SOURCE_LABELS[kind]} is not enabled on this instance.`)
    return provider
  }

  const encrypt = (value: string) => encryptSecret(value, encryptionKey)
  const decrypt = (value: string) => decryptSecret(value, encryptionKey)

  async function load(userId: string, kind: SourceKind) {
    const [row] = await db.select().from(sourceConnection).where(owned(userId, kind))
    if (!row) {
      throw new SourceConnectionUnavailableError(
        `${SOURCE_LABELS[kind]} is not connected. Connect it in Settings → Sources.`,
      )
    }
    if (row.status === 'broken') {
      throw new SourceConnectionUnavailableError(row.statusMessage ?? `Reconnect ${SOURCE_LABELS[kind]}.`)
    }
    return row
  }

  async function markBroken(userId: string, kind: SourceKind): Promise<never> {
    const label = SOURCE_LABELS[kind]
    const message = `Access to ${label} was revoked or has expired. Reconnect ${label} in Settings → Sources.`
    await db.update(sourceConnection).set({ status: 'broken', statusMessage: message }).where(owned(userId, kind))
    throw new SourceConnectionUnavailableError(message)
  }

  async function saveTokens(userId: string, kind: SourceKind, tokens: SourceTokens) {
    await db
      .update(sourceConnection)
      .set({
        encryptedAccessToken: encrypt(tokens.accessToken),
        // Refreshes usually keep the original refresh token.
        ...(tokens.refreshToken && { encryptedRefreshToken: encrypt(tokens.refreshToken) }),
        accessTokenExpiresAt: tokens.expiresAt,
      })
      .where(owned(userId, kind))
  }

  /** Swaps the refresh token for a new access token; marks the connection broken if the grant is gone. */
  async function refresh(userId: string, kind: SourceKind, encryptedRefreshToken: string | null): Promise<string> {
    if (!encryptedRefreshToken) return markBroken(userId, kind)
    let tokens: SourceTokens
    try {
      tokens = await providerFor(kind).refresh(decrypt(encryptedRefreshToken))
    } catch (error) {
      if (error instanceof SourceGrantRevokedError) return markBroken(userId, kind)
      throw error
    }
    await saveTokens(userId, kind, tokens)
    return tokens.accessToken
  }

  const isExpiring = (expiresAt: Date | null) =>
    expiresAt !== null && expiresAt.getTime() - EXPIRY_MARGIN_MS <= now().getTime()

  async function accessToken(userId: string, kind: SourceKind): Promise<string> {
    // A connection to a source the instance no longer offers is not used, even with a fresh token.
    providerFor(kind)
    const row = await load(userId, kind)
    if (isExpiring(row.accessTokenExpiresAt)) return refresh(userId, kind, row.encryptedRefreshToken)
    return decrypt(row.encryptedAccessToken)
  }

  /** Tokens to revoke a connection with, refreshing an expired access token first (Dropbox revokes with it). */
  async function tokensToRevoke(provider: SourceProvider, row: typeof sourceConnection.$inferSelect) {
    const refreshToken = row.encryptedRefreshToken ? decrypt(row.encryptedRefreshToken) : null
    let accessToken = decrypt(row.encryptedAccessToken)
    if (refreshToken && isExpiring(row.accessTokenExpiresAt)) {
      accessToken = (await provider.refresh(refreshToken)).accessToken
    }
    return { accessToken, refreshToken }
  }

  return {
    /** The consent screen to send the User to; it comes back to the callback route with `state`. */
    authorizeUrl(kind: SourceKind, state: string): string {
      return providerFor(kind).authorizeUrl(state)
    },

    async list(userId: string): Promise<SourceConnectionView[]> {
      return db
        .select(viewColumns)
        .from(sourceConnection)
        .where(eq(sourceConnection.userId, userId))
        .orderBy(asc(sourceConnection.kind))
    },

    /** Completes the OAuth dance: exchanges the consent code and saves (or replaces) the connection. */
    async connect(userId: string, kind: SourceKind, code: string): Promise<SourceConnectionView> {
      const provider = providerFor(kind)
      const tokens = await provider.exchangeCode(code)
      const accountLabel = await provider.accountLabel(tokens.accessToken)
      const encryptedRefreshToken = tokens.refreshToken ? encrypt(tokens.refreshToken) : null
      const values = {
        accountLabel,
        encryptedAccessToken: encrypt(tokens.accessToken),
        accessTokenExpiresAt: tokens.expiresAt,
        status: 'ok' as const,
        statusMessage: null,
      }
      const [row] = await db
        .insert(sourceConnection)
        .values({ userId, kind, ...values, encryptedRefreshToken })
        .onConflictDoUpdate({
          target: [sourceConnection.userId, sourceConnection.kind],
          // A reconnect without a new refresh token keeps the previous one.
          set: {
            ...values,
            ...(encryptedRefreshToken && { encryptedRefreshToken }),
            createdAt: now(),
          },
        })
        .returning(viewColumns)
      return row!
    },

    /**
     * A usable access token, refreshed if it is about to expire. Throws
     * SourceConnectionUnavailableError when the connection is missing or broken.
     */
    accessToken,

    /**
     * Downloads one picked file with the User's connection. If the provider rejects a token that
     * has not expired yet, refreshes it once and retries. Never throws for an unusable connection.
     */
    async download(userId: string, kind: SourceKind, fileId: string, limits: DocumentLimits): Promise<SourceDownload> {
      try {
        const provider = providerFor(kind)
        const first = await provider.download(await accessToken(userId, kind), fileId, limits)
        if (first.ok || !first.tokenRejected) return first
        const row = await load(userId, kind)
        const retried = await provider.download(await refresh(userId, kind, row.encryptedRefreshToken), fileId, limits)
        if (retried.ok || !retried.tokenRejected) return retried
        return await markBroken(userId, kind)
      } catch (error) {
        if (error instanceof SourceConnectionUnavailableError) return { ok: false, reason: error.message }
        throw error
      }
    },

    /** Revokes the grant at the provider (best effort) and deletes the connection. False if none. */
    async disconnect(userId: string, kind: SourceKind): Promise<boolean> {
      const [row] = await db.delete(sourceConnection).where(owned(userId, kind)).returning()
      if (!row) return false
      const provider = deps.providers[kind]
      if (provider) {
        try {
          await provider.revoke(await tokensToRevoke(provider, row))
        } catch (error) {
          console.warn(`[sources] could not revoke ${kind} access; the connection was removed anyway`, error)
        }
      }
      return true
    },
  }
}

export type SourceConnections = ReturnType<typeof createSourceConnections>
