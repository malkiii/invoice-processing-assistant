import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { user } from '../../server/db/schema'
import {
  SourceGrantRevokedError,
  type SourceDownload,
  type SourceKind,
  type SourceProvider,
  type SourceTokens,
} from '../../server/domain/source-providers'
import {
  createSourceConnections,
  SourceConnectionUnavailableError,
  type SourceConnections,
} from '../../server/lib/source-connections'
import { startTestDatabase, type TestDatabase } from './support/database'

const encryptionKey = Buffer.from('cd'.repeat(32), 'hex')
const limits = { maxDocumentBytes: 1000, maxDocumentPages: 30 }

let testDb: TestDatabase
let clock: Date

/**
 * A provider account as the adapters would see it: issues numbered tokens, accepts only the
 * current access token, and can have its grant revoked by the User.
 */
function fakeProvider(kind: SourceKind, label: string) {
  let issued = 0
  const state = {
    revokedGrant: false,
    validAccessToken: '',
    refreshes: 0,
    revoked: [] as { accessToken: string; refreshToken: string | null }[],
    files: { 'file-1': new TextEncoder().encode('%PDF') } as Record<string, Uint8Array>,
  }
  const issue = (withRefresh: boolean): SourceTokens => {
    issued++
    state.validAccessToken = `${kind}-access-${issued}`
    return {
      accessToken: state.validAccessToken,
      refreshToken: withRefresh ? `${kind}-refresh-${issued}` : null,
      expiresAt: new Date(clock.getTime() + 3600_000),
    }
  }
  const provider: SourceProvider = {
    kind,
    authorizeUrl: (s) => `https://${kind}.example/auth?state=${s}`,
    async exchangeCode(code) {
      if (code !== 'good-code') throw new Error('invalid code')
      return issue(true)
    },
    async refresh(refreshToken) {
      state.refreshes++
      if (state.revokedGrant || !refreshToken.startsWith(`${kind}-refresh-`)) {
        throw new SourceGrantRevokedError('Token has been expired or revoked.')
      }
      return issue(false)
    },
    async accountLabel(accessToken) {
      if (accessToken !== state.validAccessToken) throw new Error('bad token')
      return label
    },
    async download(accessToken, fileId): Promise<SourceDownload> {
      if (accessToken !== state.validAccessToken) return { ok: false, reason: 'refused', tokenRejected: true }
      const bytes = state.files[fileId]
      return bytes ? { ok: true, bytes } : { ok: false, reason: 'not found' }
    },
    async revoke(tokens) {
      state.revoked.push(tokens)
    },
  }
  return { provider, state }
}

let drive: ReturnType<typeof fakeProvider>
let dropbox: ReturnType<typeof fakeProvider>
let connections: SourceConnections

beforeAll(async () => {
  testDb = await startTestDatabase()
  await testDb.db.insert(user).values([
    { id: 'alice', name: 'Alice', email: 'alice@example.com' },
    { id: 'bob', name: 'Bob', email: 'bob@example.com' },
  ])
})

afterAll(async () => {
  await testDb?.stop()
})

beforeEach(async () => {
  await testDb.db.execute(sql`delete from source_connection`)
  clock = new Date('2026-11-18T12:00:00Z')
  drive = fakeProvider('google-drive', 'alice@gmail.com')
  dropbox = fakeProvider('dropbox', 'alice@dropbox.example')
  connections = createSourceConnections({
    db: testDb.db,
    encryptionKey,
    providers: { 'google-drive': drive.provider, dropbox: dropbox.provider },
    now: () => clock,
  })
})

async function storedSourceData(): Promise<string> {
  const rows = await testDb.db.execute(sql`select * from source_connection`)
  return JSON.stringify(rows.rows)
}

describe('connecting', () => {
  it('saves the account behind a consent code, with its tokens encrypted at rest', async () => {
    const view = await connections.connect('alice', 'google-drive', 'good-code')

    expect(view).toMatchObject({ kind: 'google-drive', accountLabel: 'alice@gmail.com', status: 'ok', statusMessage: null })
    expect(await connections.list('alice')).toEqual([view])
    const stored = await storedSourceData()
    expect(stored).not.toContain('google-drive-access-1')
    expect(stored).not.toContain('google-drive-refresh-1')
    expect(JSON.stringify(view)).not.toContain('google-drive-access-1')
  })

  it('keeps each User’s connections to themselves', async () => {
    await connections.connect('alice', 'dropbox', 'good-code')
    expect(await connections.list('bob')).toEqual([])
    await expect(connections.accessToken('bob', 'dropbox')).rejects.toBeInstanceOf(SourceConnectionUnavailableError)
  })

  it('replaces the existing connection when the User connects the same provider again', async () => {
    await connections.connect('alice', 'dropbox', 'good-code')
    await connections.connect('alice', 'dropbox', 'good-code')
    const list = await connections.list('alice')
    expect(list).toHaveLength(1)
    expect(await connections.accessToken('alice', 'dropbox')).toBe('dropbox-access-2')
  })

  it('keeps the refresh token when a reconnect does not issue a new one', async () => {
    await connections.connect('alice', 'google-drive', 'good-code')
    const exchange = drive.provider.exchangeCode
    drive.provider.exchangeCode = async (code) => ({ ...(await exchange(code)), refreshToken: null })
    await connections.connect('alice', 'google-drive', 'good-code')
    clock = new Date(clock.getTime() + 2 * 3600_000)

    expect(await connections.accessToken('alice', 'google-drive')).toBe('google-drive-access-3')
  })

  it('refuses a provider the instance has not configured', async () => {
    const onlyDrive = createSourceConnections({
      db: testDb.db,
      encryptionKey,
      providers: { 'google-drive': drive.provider },
      now: () => clock,
    })
    await expect(onlyDrive.connect('alice', 'dropbox', 'good-code')).rejects.toBeInstanceOf(
      SourceConnectionUnavailableError,
    )
  })
})

describe('using a connection', () => {
  it('hands out the stored access token while it is fresh', async () => {
    await connections.connect('alice', 'google-drive', 'good-code')
    expect(await connections.accessToken('alice', 'google-drive')).toBe('google-drive-access-1')
    expect(drive.state.refreshes).toBe(0)
  })

  it('refreshes an expired access token and keeps using the original refresh token', async () => {
    await connections.connect('alice', 'google-drive', 'good-code')
    clock = new Date(clock.getTime() + 2 * 3600_000)

    expect(await connections.accessToken('alice', 'google-drive')).toBe('google-drive-access-2')
    expect(await connections.accessToken('alice', 'google-drive')).toBe('google-drive-access-2')
    expect(drive.state.refreshes).toBe(1)

    clock = new Date(clock.getTime() + 2 * 3600_000)
    expect(await connections.accessToken('alice', 'google-drive')).toBe('google-drive-access-3')
    expect(await storedSourceData()).not.toContain('google-drive-access-3')
  })

  it('marks the connection broken when the User revoked access, and stops using it', async () => {
    await connections.connect('alice', 'google-drive', 'good-code')
    clock = new Date(clock.getTime() + 2 * 3600_000)
    drive.state.revokedGrant = true

    await expect(connections.accessToken('alice', 'google-drive')).rejects.toThrow(/Reconnect Google Drive/)
    expect((await connections.list('alice'))[0]).toMatchObject({ status: 'broken', statusMessage: expect.stringMatching(/Reconnect/) })
    await expect(connections.accessToken('alice', 'google-drive')).rejects.toBeInstanceOf(
      SourceConnectionUnavailableError,
    )
    expect(drive.state.refreshes).toBe(1)
  })

  it('downloads a file, refreshing once when the provider rejects a token it has not expired yet', async () => {
    await connections.connect('alice', 'dropbox', 'good-code')
    dropbox.state.validAccessToken = 'rotated-elsewhere'

    const result = await connections.download('alice', 'dropbox', 'file-1', limits)

    expect(result).toEqual({ ok: true, bytes: new TextEncoder().encode('%PDF') })
    expect(dropbox.state.refreshes).toBe(1)
  })

  it('explains a download from a provider the User has not connected', async () => {
    expect(await connections.download('alice', 'dropbox', 'file-1', limits)).toEqual({
      ok: false,
      reason: 'Dropbox is not connected. Connect it in Settings → Sources.',
    })
  })
})

describe('disconnecting', () => {
  it('revokes access at the provider and forgets the tokens', async () => {
    await connections.connect('alice', 'dropbox', 'good-code')

    expect(await connections.disconnect('alice', 'dropbox')).toBe(true)

    expect(dropbox.state.revoked).toEqual([{ accessToken: 'dropbox-access-1', refreshToken: 'dropbox-refresh-1' }])
    expect(await connections.list('alice')).toEqual([])
    expect(await storedSourceData()).toBe('[]')
  })

  it('revokes with a fresh access token when the stored one has expired', async () => {
    await connections.connect('alice', 'dropbox', 'good-code')
    clock = new Date(clock.getTime() + 2 * 3600_000)

    expect(await connections.disconnect('alice', 'dropbox')).toBe(true)

    expect(dropbox.state.revoked).toEqual([{ accessToken: 'dropbox-access-2', refreshToken: 'dropbox-refresh-1' }])
    expect(await connections.list('alice')).toEqual([])
  })

  it('still disconnects when the provider cannot be reached to revoke', async () => {
    await connections.connect('alice', 'dropbox', 'good-code')
    dropbox.provider.revoke = async () => {
      throw new Error('network down')
    }
    expect(await connections.disconnect('alice', 'dropbox')).toBe(true)
    expect(await connections.list('alice')).toEqual([])
  })

  it('reports nothing to disconnect for a provider that is not connected', async () => {
    expect(await connections.disconnect('bob', 'dropbox')).toBe(false)
  })
})
