/**
 * Reads and validates the process environment once, so the app and the worker
 * agree on configuration. Must not import Nuxt or Nitro.
 */
import type { SourceOAuthApp } from '../domain/source-providers'

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

export interface GoogleDriveSourceConfig extends SourceOAuthApp {
  /** Browser-safe key for the Google Picker. */
  pickerApiKey: string
  /** The Google Cloud project number, required by the Picker. */
  pickerAppId: string
}

/**
 * Enabled Source Connection providers (ticket 12), separate from the sign-in OAuth clients. A provider
 * is absent when its env values are not all set. Redirect URIs are `${authUrl}/api/sources/<slug>/callback`.
 */
export interface SourcesConfig {
  'google-drive'?: GoogleDriveSourceConfig
  dropbox?: SourceOAuthApp
}

export interface AppConfig {
  databaseUrl: string
  authSecret: string
  authUrl: string
  encryptionKey: Buffer
  smtp: SmtpConfig | null
  requireEmailVerification: boolean
  oauth: { google?: OAuthCredentials; github?: OAuthCredentials }
  sources: SourcesConfig
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

/** Reads a group of env values that only make sense together; null (and a warning) unless all are set. */
function readGroup<K extends string>(env: Env, label: string, names: Record<K, string>, warnings: string[]) {
  const entries = Object.entries(names) as [K, string][]
  const values = entries.map(([key, name]) => [key, optional(env, name)] as const)
  const missing = entries.filter((_, i) => !values[i]![1]).map(([, name]) => name)
  if (missing.length === entries.length) return null
  if (missing.length > 0) {
    warnings.push(`${label} is disabled: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set.`)
    return null
  }
  return Object.fromEntries(values) as Record<K, string>
}

function readSources(env: Env, authUrl: string, warnings: string[]): SourcesConfig {
  const callback = (slug: string) => `${authUrl.replace(/\/+$/, '')}/api/sources/${slug}/callback`
  const google = readGroup(
    env,
    'Google Drive',
    {
      clientId: 'GOOGLE_DRIVE_CLIENT_ID',
      clientSecret: 'GOOGLE_DRIVE_CLIENT_SECRET',
      pickerApiKey: 'GOOGLE_PICKER_API_KEY',
      pickerAppId: 'GOOGLE_PICKER_APP_ID',
    },
    warnings,
  )
  const dropbox = readGroup(
    env,
    'Dropbox',
    { clientId: 'DROPBOX_APP_KEY', clientSecret: 'DROPBOX_APP_SECRET' },
    warnings,
  )
  return {
    ...(google && {
      'google-drive': {
        clientId: google.clientId,
        clientSecret: google.clientSecret,
        redirectUri: callback('google'),
        pickerApiKey: google.pickerApiKey,
        pickerAppId: google.pickerAppId,
      },
    }),
    ...(dropbox && { dropbox: { ...dropbox, redirectUri: callback('dropbox') } }),
  }
}

export function readAppConfig(env: Env = process.env): AppConfig {
  const smtp = readSmtp(env)
  const google = readOAuth(env, 'GOOGLE')
  const github = readOAuth(env, 'GITHUB')
  const warnings: string[] = []
  if (!smtp) {
    warnings.push('SMTP is not configured: email verification is skipped and no emails are sent.')
  }

  const authUrl = optional(env, 'BETTER_AUTH_URL') ?? 'http://localhost:3000'
  const sources = readSources(env, authUrl, warnings)

  return {
    databaseUrl: required(env, 'DATABASE_URL'),
    authSecret: required(env, 'BETTER_AUTH_SECRET'),
    authUrl,
    encryptionKey: readEncryptionKey(env),
    smtp,
    requireEmailVerification: smtp !== null,
    oauth: { ...(google && { google }), ...(github && { github }) },
    sources,
    warnings,
  }
}
