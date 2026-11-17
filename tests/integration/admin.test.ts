import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { authorizeAdmin } from '../../server/admin/guard'
import { createAdminService, type AdminService } from '../../server/admin/service'
import { noUserFiles, type UserFileStore } from '../../server/admin/user-files'
import { startWorker } from '../../server/worker/start'
import { createAuth, type Auth } from '../../server/lib/auth'
import { readAppConfig } from '../../server/lib/config'
import type { Mail, Mailer } from '../../server/lib/mailer'
import { startTestDatabase, type TestDatabase } from './support/database'

let testDb: TestDatabase
let auth: Auth
let admin: AdminService
let adminId: string
const sent: Mail[] = []
const mailer: Mailer = { send: async (mail) => void sent.push(mail) }

// In-memory stand-in for object storage: object keys by owning User.
const files = new Map<string, string[]>()
let failFileDeletion = false
let storageDown = false
const userFiles: UserFileStore = {
  async deleteAllForUser(userId) {
    if (failFileDeletion) throw new Error('storage down')
    files.delete(userId)
  },
}

beforeAll(async () => {
  testDb = await startTestDatabase()
  const config = readAppConfig({
    DATABASE_URL: testDb.url,
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
    BETTER_AUTH_URL: 'http://localhost:3000',
    ENCRYPTION_KEY: 'a'.repeat(64),
  })
  auth = createAuth({ db: testDb.db, config, mailer: null })
  admin = createAdminService({
    db: testDb.db,
    mailer,
    appUrl: config.authUrl,
    userFiles,
    checkStorage: async () => {
      if (storageDown) throw new Error('bucket unreachable')
    },
  })
  adminId = (await signUp('admin@example.com')).user.id
})

afterAll(async () => {
  await testDb?.stop()
})

function signUp(email: string, inviteToken?: string) {
  return auth.api.signUpEmail({
    body: { email, password: 'correct horse battery', name: email.split('@')[0]!, inviteToken },
  })
}

function signIn(email: string) {
  return auth.api.signInEmail({ body: { email, password: 'correct horse battery' } })
}

function tokenFrom(link: string) {
  return new URL(link).searchParams.get('invite')!
}

describe('admin guard', () => {
  async function headersFor(email: string) {
    const { headers } = await auth.api.signInEmail({
      body: { email, password: 'correct horse battery' },
      returnHeaders: true,
    })
    return new Headers({ cookie: headers.get('set-cookie')! })
  }

  it('rejects anonymous requests with 401', async () => {
    expect(await authorizeAdmin(auth, new Headers())).toEqual({ allowed: false, statusCode: 401 })
  })

  it('rejects non-admin Users with 403', async () => {
    await signUp('regular@example.com')
    expect(await authorizeAdmin(auth, await headersFor('regular@example.com'))).toEqual({
      allowed: false,
      statusCode: 403,
    })
  })

  it('lets the Admin through', async () => {
    const result = await authorizeAdmin(auth, await headersFor('admin@example.com'))
    expect(result).toMatchObject({ allowed: true, session: { user: { id: adminId } } })
  })
})

describe('users', () => {
  it('lists Users with account fields only', async () => {
    await signUp('lister@example.com')
    const users = await admin.listUsers()
    const lister = users.find((u) => u.email === 'lister@example.com')!
    expect(lister).toEqual({
      id: expect.any(String),
      name: 'lister',
      email: 'lister@example.com',
      role: 'user',
      emailVerified: false,
      disabled: false,
      twoFactorEnabled: false,
      createdAt: expect.any(Date),
    })
    expect(users.find((u) => u.email === 'admin@example.com')?.role).toBe('admin')
  })

  it('disables a User: their sessions end and they cannot sign in until re-enabled', async () => {
    const { user } = await signUp('disabled@example.com')
    const { headers: signInHeaders } = await auth.api.signInEmail({
      body: { email: 'disabled@example.com', password: 'correct horse battery' },
      returnHeaders: true,
    })
    const headers = new Headers({ cookie: signInHeaders.get('set-cookie')! })
    expect(await auth.api.getSession({ headers })).not.toBeNull()

    await admin.disableUser({ userId: user.id, actorId: adminId })

    expect((await admin.listUsers()).find((u) => u.id === user.id)?.disabled).toBe(true)
    expect(await auth.api.getSession({ headers })).toBeNull()
    await expect(signIn('disabled@example.com')).rejects.toThrow()

    await admin.enableUser(user.id)
    await expect(signIn('disabled@example.com')).resolves.toMatchObject({ user: { id: user.id } })
  })

  it('does not let the Admin disable or delete themselves', async () => {
    await expect(admin.disableUser({ userId: adminId, actorId: adminId })).rejects.toThrow(/yourself/)
    await expect(admin.deleteUser({ userId: adminId, actorId: adminId })).rejects.toThrow(/yourself/)
  })

  it('deletes a User together with their sessions and stored files', async () => {
    const { user } = await signUp('leaver@example.com')
    const { user: stayer } = await signUp('stayer@example.com')
    files.set(user.id, ['documents/a.pdf', 'documents/b.png'])
    files.set(stayer.id, ['documents/c.pdf'])

    await admin.deleteUser({ userId: user.id, actorId: adminId })

    expect(files.has(user.id)).toBe(false)
    expect(files.get(stayer.id)).toEqual(['documents/c.pdf'])
    expect((await admin.listUsers()).map((u) => u.id)).not.toContain(user.id)
    await expect(signIn('leaver@example.com')).rejects.toThrow()
  })

  it('keeps the User when their files cannot be deleted, so deletion can be retried', async () => {
    const { user } = await signUp('stuck@example.com')
    failFileDeletion = true
    try {
      await expect(admin.deleteUser({ userId: user.id, actorId: adminId })).rejects.toThrow(/storage down/)
    } finally {
      failFileDeletion = false
    }
    expect((await admin.listUsers()).map((u) => u.id)).toContain(user.id)
  })

  it('reports an unknown User as not found', async () => {
    await expect(admin.deleteUser({ userId: 'nope', actorId: adminId })).rejects.toThrow(/not found/)
  })
})

describe('system health', () => {
  it('reports the queue as down before pg-boss has installed its schema', async () => {
    const health = await admin.getHealth()
    expect(health.database).toEqual({ status: 'ok' })
    expect(health.queue).toEqual({ status: 'down', error: expect.stringContaining('pgboss') })
  })

  it('reports database, storage and queue depth', async () => {
    const worker = await startWorker({ databaseUrl: testDb.url })
    try {
      await worker.boss.createQueue('health-probe')
      await worker.boss.send('health-probe', {})
      await worker.boss.send('health-probe', {})

      expect(await admin.getHealth()).toEqual({
        database: { status: 'ok' },
        storage: { status: 'ok' },
        queue: { status: 'ok', queued: 2, active: 0 },
      })

      storageDown = true
      expect((await admin.getHealth()).storage).toEqual({ status: 'down', error: 'bucket unreachable' })
    } finally {
      storageDown = false
      await worker.stop()
    }
  })

  it('reports storage as not configured when no probe is wired', async () => {
    const bare = createAdminService({ db: testDb.db, mailer: null, appUrl: 'http://x', userFiles: noUserFiles })
    expect((await bare.getHealth()).storage).toEqual({ status: 'not-configured' })
  })
})

describe('instance settings', () => {
  it('stores Document limits and per-User concurrency', async () => {
    expect((await admin.getSettings()).maxConcurrentDocumentsPerUser).toBe(2)
    const saved = await admin.updateSettings({
      maxDocumentBytes: 10 * 1024 * 1024,
      maxDocumentPages: 12,
      maxConcurrentDocumentsPerUser: 4,
    })
    expect(saved).toEqual({
      signUpPolicy: 'open',
      maxDocumentBytes: 10 * 1024 * 1024,
      maxDocumentPages: 12,
      maxConcurrentDocumentsPerUser: 4,
    })
    expect(await admin.getSettings()).toEqual(saved)
  })
})

describe('invites', () => {
  it('emails an invite link to the sign-up page', async () => {
    const result = await admin.inviteUser({ email: 'Invitee@Example.com', invitedBy: adminId })
    expect(result.emailed).toBe(true)
    expect(result.invite.email).toBe('invitee@example.com')
    const url = new URL(result.link)
    expect(url.origin + url.pathname).toBe('http://localhost:3000/auth/sign-up')
    expect(sent.at(-1)?.to).toBe('invitee@example.com')
    expect(sent.at(-1)?.text).toContain(result.link)
  })

  it('lets an invited User sign up with the link while sign-up is invite-only', async () => {
    await admin.updateSettings({ signUpPolicy: 'invite-only' })
    const { link } = await admin.inviteUser({ email: 'guest@example.com', invitedBy: adminId })

    const { user } = await signUp('guest@example.com', tokenFrom(link))

    expect(user.role).toBe('user')
    expect((await admin.listInvites()).map((i) => i.email)).not.toContain('guest@example.com')
  })

  it('rejects sign-up without the invite token, or with a token for another email', async () => {
    const { link } = await admin.inviteUser({ email: 'carol@example.com', invitedBy: adminId })
    await expect(signUp('carol@example.com')).rejects.toThrow(/invite-only/)
    await expect(signUp('mallory@example.com', tokenFrom(link))).rejects.toThrow(/invite-only/)
  })

  it('rejects a revoked invite', async () => {
    const { link, invite } = await admin.inviteUser({ email: 'dave@example.com', invitedBy: adminId })
    await admin.revokeInvite(invite.id)
    await expect(signUp('dave@example.com', tokenFrom(link))).rejects.toThrow(/invite-only/)
  })

  it('refuses to invite an email that already has an account', async () => {
    await expect(admin.inviteUser({ email: 'admin@example.com', invitedBy: adminId })).rejects.toThrow(
      /already has an account/,
    )
  })
})
