import { createDatabase, type Database } from '../db/client'
import { createAuth, type Auth } from '../lib/auth'
import { readAppConfig, type AppConfig } from '../lib/config'
import { createSmtpMailer } from '../lib/mailer'

// Process-wide singletons for Nitro routes. Created lazily on first use.
let config: AppConfig | undefined
let db: Database | undefined
let auth: Auth | undefined

export function useServerConfig(): AppConfig {
  return (config ??= readAppConfig())
}

export function useDb(): Database {
  return (db ??= createDatabase(useServerConfig().databaseUrl).db)
}

export function useAuth(): Auth {
  if (!auth) {
    const config = useServerConfig()
    auth = createAuth({
      db: useDb(),
      config,
      mailer: config.smtp ? createSmtpMailer(config.smtp) : null,
    })
  }
  return auth
}
