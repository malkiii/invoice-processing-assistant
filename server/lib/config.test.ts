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
})
