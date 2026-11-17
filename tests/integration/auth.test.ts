import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAuth, type Auth } from '../../server/lib/auth'
import { readAppConfig } from '../../server/lib/config'
import { getInstanceSettings, updateInstanceSettings } from '../../server/db/instance-settings'
import { startTestDatabase, type TestDatabase } from './support/database'

let testDb: TestDatabase
let auth: Auth

beforeAll(async () => {
  testDb = await startTestDatabase()
  const config = readAppConfig({
    DATABASE_URL: testDb.url,
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
    BETTER_AUTH_URL: 'http://localhost:3000',
    ENCRYPTION_KEY: 'a'.repeat(64),
  })
  auth = createAuth({ db: testDb.db, config, mailer: null })
})

afterAll(async () => {
  await testDb?.stop()
})

async function signUp(email: string) {
  return auth.api.signUpEmail({
    body: { email, password: 'correct horse battery', name: email.split('@')[0]! },
  })
}

describe('sign-up and sign-in', () => {
  it('starts with an open sign-up policy and the default Document limits', async () => {
    expect(await getInstanceSettings(testDb.db)).toEqual({
      signUpPolicy: 'open',
      maxDocumentBytes: 25 * 1024 * 1024,
      maxDocumentPages: 30,
      maxConcurrentDocumentsPerUser: 3,
    })
  })

  it('makes the first User an Admin', async () => {
    const { user } = await signUp('first@example.com')
    expect(user.role).toBe('admin')
  })

  it('lets that User sign out and sign back in', async () => {
    const signIn = await auth.api.signInEmail({
      body: { email: 'first@example.com', password: 'correct horse battery' },
      returnHeaders: true,
    })
    const cookie = signIn.headers.get('set-cookie')!
    const headers = new Headers({ cookie })
    expect((await auth.api.getSession({ headers }))?.user.email).toBe('first@example.com')

    await auth.api.signOut({ headers })
    expect(await auth.api.getSession({ headers })).toBeNull()

    const again = await auth.api.signInEmail({
      body: { email: 'first@example.com', password: 'correct horse battery' },
    })
    expect(again.user.email).toBe('first@example.com')
  })

  it('gives later Users the user role while sign-up is open', async () => {
    const { user } = await signUp('second@example.com')
    expect(user.role).toBe('user')
  })

  it('blocks sign-up when the policy is invite-only', async () => {
    await updateInstanceSettings(testDb.db, { signUpPolicy: 'invite-only' })
    await expect(signUp('third@example.com')).rejects.toThrow(/invite-only/)
  })
})
