import { describe, expect, it } from 'vitest'
import { readAppConfig } from './config'

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
  ENCRYPTION_KEY: 'a'.repeat(64),
}

describe('readAppConfig', () => {
  it('skips email verification and warns when SMTP is not configured', () => {
    const config = readAppConfig(base)
    expect(config.smtp).toBeNull()
    expect(config.requireEmailVerification).toBe(false)
    expect(config.warnings).toContain(
      'SMTP is not configured: email verification is skipped and no emails are sent.',
    )
  })

  it('requires email verification when SMTP is configured', () => {
    const config = readAppConfig({
      ...base,
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '2525',
      SMTP_USER: 'mailer',
      SMTP_PASSWORD: 'secret',
      SMTP_FROM: 'Invoices <no-reply@example.com>',
    })
    expect(config.requireEmailVerification).toBe(true)
    expect(config.smtp).toEqual({
      host: 'smtp.example.com',
      port: 2525,
      secure: false,
      user: 'mailer',
      password: 'secret',
      from: 'Invoices <no-reply@example.com>',
    })
    expect(config.warnings).toEqual([])
  })

  it('enables only the OAuth providers whose credentials are both present', () => {
    const config = readAppConfig({
      ...base,
      GOOGLE_CLIENT_ID: 'gid',
      GOOGLE_CLIENT_SECRET: 'gsecret',
      GITHUB_CLIENT_ID: 'only-the-id',
    })
    expect(config.oauth).toEqual({
      google: { clientId: 'gid', clientSecret: 'gsecret' },
    })
  })

  it('rejects a missing database URL or auth secret', () => {
    expect(() => readAppConfig({ ...base, DATABASE_URL: '' })).toThrow(/DATABASE_URL/)
    expect(() => readAppConfig({ ...base, BETTER_AUTH_SECRET: undefined })).toThrow(
      /BETTER_AUTH_SECRET/,
    )
  })

  it('rejects an ENCRYPTION_KEY that is not 32 bytes of hex', () => {
    expect(() => readAppConfig({ ...base, ENCRYPTION_KEY: 'short' })).toThrow(/ENCRYPTION_KEY/)
  })

  describe('Source Connections', () => {
    const google = {
      GOOGLE_DRIVE_CLIENT_ID: 'drive-id',
      GOOGLE_DRIVE_CLIENT_SECRET: 'drive-secret',
      GOOGLE_PICKER_API_KEY: 'picker-key',
      GOOGLE_PICKER_APP_ID: '123456',
    }
    const dropbox = { DROPBOX_APP_KEY: 'dbx-key', DROPBOX_APP_SECRET: 'dbx-secret' }

    it('enables each source whose values are all set, with its callback under the auth URL', () => {
      const config = readAppConfig({ ...base, ...google, ...dropbox })
      expect(config.sources).toEqual({
        'google-drive': {
          clientId: 'drive-id',
          clientSecret: 'drive-secret',
          redirectUri: 'http://localhost:3000/api/sources/google/callback',
          pickerApiKey: 'picker-key',
          pickerAppId: '123456',
        },
        dropbox: {
          clientId: 'dbx-key',
          clientSecret: 'dbx-secret',
          redirectUri: 'http://localhost:3000/api/sources/dropbox/callback',
        },
      })
      expect(config.warnings).not.toContainEqual(expect.stringMatching(/Google Drive|Dropbox/))
    })

    it('leaves sources disabled when nothing is set', () => {
      expect(readAppConfig(base).sources).toEqual({})
    })

    it('disables a partly configured source and warns which values are missing', () => {
      const config = readAppConfig({ ...base, ...google, GOOGLE_PICKER_APP_ID: '', DROPBOX_APP_KEY: 'dbx-key' })
      expect(config.sources).toEqual({})
      expect(config.warnings).toContain('Google Drive is disabled: GOOGLE_PICKER_APP_ID is not set.')
      expect(config.warnings).toContain('Dropbox is disabled: DROPBOX_APP_SECRET is not set.')
    })
  })
})
