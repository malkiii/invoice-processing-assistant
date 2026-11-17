import { createDatabase, type Database } from '../db/client'
import { createAuth, type Auth } from '../lib/auth'
import { readAppConfig, type AppConfig } from '../lib/config'
import { createSmtpMailer } from '../lib/mailer'
import { PgBoss } from 'pg-boss'
import { createDocumentLibrary, type DocumentLibrary } from '../domain/document-library'
import { listenToDocumentStatus, type DocumentStatusListener } from '../domain/document-events'
import { createExtractionQueue, type ExtractionQueue } from '../domain/extraction-queue'
import { createIntake, type Intake } from '../domain/intake'
import { createS3Storage, type ObjectStorage } from '../domain/storage'
import { readStorageConfig } from '../lib/storage-config'
import { createHttpsTransport, resolveWithSystemDns } from '../domain/https-transport'
import { fetchUrl } from '../domain/url-fetch'
import { createUrlFetchQueue, createUrlIntake, type UrlFetchQueue, type UrlIntake } from '../domain/url-intake'

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

// --- Intake (ticket 04) ---
let storage: ObjectStorage | undefined
let extractionQueue: Promise<ExtractionQueue> | undefined
let documentEvents: Promise<DocumentStatusListener> | undefined

export function useDocumentStorage(): ObjectStorage {
  return (storage ??= createS3Storage(readStorageConfig()))
}

let queueBoss: Promise<PgBoss> | undefined

/** One pg-boss connection per process for sending jobs. The app only sends; the worker consumes. */
function useQueueBoss(): Promise<PgBoss> {
  return (queueBoss ??= (async () => {
    const boss = new PgBoss(useServerConfig().databaseUrl)
    boss.on('error', (error) => console.error('[pg-boss] error', error))
    await boss.start()
    return boss
  })().catch((error) => {
    queueBoss = undefined
    throw error
  }))
}

/** pg-boss producer for extraction jobs. */
export function useExtractionQueue(): Promise<ExtractionQueue> {
  return (extractionQueue ??= useQueueBoss()
    .then(createExtractionQueue)
    .catch((error) => {
      extractionQueue = undefined
      throw error
    }))
}

export async function useIntake(): Promise<Intake> {
  return createIntake({ db: useDb(), storage: useDocumentStorage(), queue: await useExtractionQueue() })
}

export function useDocumentLibrary(): DocumentLibrary {
  return createDocumentLibrary({ db: useDb(), storage: useDocumentStorage() })
}

/** One LISTEN connection per process, shared by every SSE stream. */
export function useDocumentEvents(): Promise<DocumentStatusListener> {
  return (documentEvents ??= listenToDocumentStatus(useServerConfig().databaseUrl).catch((error) => {
    documentEvents = undefined
    throw error
  }))
}

// --- URL intake (ticket 10) ---
let urlFetchQueue: Promise<UrlFetchQueue> | undefined

function useUrlFetchQueue(): Promise<UrlFetchQueue> {
  return (urlFetchQueue ??= useQueueBoss()
    .then(createUrlFetchQueue)
    .catch((error) => {
      urlFetchQueue = undefined
      throw error
    }))
}

export async function useUrlIntake(): Promise<UrlIntake> {
  const transport = createHttpsTransport()
  return createUrlIntake({
    db: useDb(),
    storage: useDocumentStorage(),
    extractionQueue: await useExtractionQueue(),
    fetchQueue: await useUrlFetchQueue(),
    fetchUrl: (url, limits) => fetchUrl(url, { resolve: resolveWithSystemDns, transport, limits }),
  })
}
