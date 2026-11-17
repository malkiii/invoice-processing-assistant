/**
 * Reads and validates the process environment once, so the app and the worker
 * agree on configuration. Must not import Nuxt or Nitro.
 */

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string | undefined
  password: string | undefined
  from: string
}

export interface OAuthCredentials {
  clientId: string
  clientSecret: string
}

export interface AppConfig {
  databaseUrl: string
  authSecret: string
  authUrl: string
  encryptionKey: Buffer
  smtp: SmtpConfig | null
  requireEmailVerification: boolean
  oauth: { google?: OAuthCredentials; github?: OAuthCredentials }
  warnings: string[]
}

type Env = Record<string, string | undefined>

function required(env: Env, name: string): string {
  const value = env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable ${name}`)
  return value
}

function optional(env: Env, name: string): string | undefined {
  return env[name]?.trim() || undefined
}

function readEncryptionKey(env: Env): Buffer {
  const raw = required(env, 'ENCRYPTION_KEY')
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error('ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters')
  }
  return Buffer.from(raw, 'hex')
}

function readSmtp(env: Env): SmtpConfig | null {
  const host = optional(env, 'SMTP_HOST')
  if (!host) return null
  const port = Number(optional(env, 'SMTP_PORT') ?? '587')
  return {
    host,
    port,
    secure: (optional(env, 'SMTP_SECURE') ?? (port === 465 ? 'true' : 'false')) === 'true',
    user: optional(env, 'SMTP_USER'),
    password: optional(env, 'SMTP_PASSWORD'),
    from: optional(env, 'SMTP_FROM') ?? `no-reply@${host}`,
  }
}

function readOAuth(env: Env, prefix: string): OAuthCredentials | undefined {
  const clientId = optional(env, `${prefix}_CLIENT_ID`)
  const clientSecret = optional(env, `${prefix}_CLIENT_SECRET`)
  return clientId && clientSecret ? { clientId, clientSecret } : undefined
}

export function readAppConfig(env: Env = process.env): AppConfig {
  const smtp = readSmtp(env)
  const google = readOAuth(env, 'GOOGLE')
  const github = readOAuth(env, 'GITHUB')
  const warnings: string[] = []
  if (!smtp) {
    warnings.push('SMTP is not configured: email verification is skipped and no emails are sent.')
  }

  return {
    databaseUrl: required(env, 'DATABASE_URL'),
    authSecret: required(env, 'BETTER_AUTH_SECRET'),
    authUrl: optional(env, 'BETTER_AUTH_URL') ?? 'http://localhost:3000',
    encryptionKey: readEncryptionKey(env),
    smtp,
    requireEmailVerification: smtp !== null,
    oauth: { ...(google && { google }), ...(github && { github }) },
    warnings,
  }
}
