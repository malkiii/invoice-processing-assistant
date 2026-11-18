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
import { createReextraction, type Reextraction } from '../domain/review/rerun'
import { createReview, type Review } from '../domain/review/review'
import { createSourceFetchQueue, createSourceIntake, type SourceFetchQueue, type SourceIntake } from '../domain/source-intake'
import { createSourceConnections, createSourceProviders, type SourceConnections } from '../lib/source-connections'
import { createExportQueue, createExports, type ExportQueue, type Exports } from '../domain/export/exports'

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

// --- Review and Re-run (ticket 06) ---
export function useReview(): Review {
  return createReview({ db: useDb() })
}

export async function useReextraction(): Promise<Reextraction> {
  return createReextraction({ db: useDb(), queue: await useExtractionQueue() })
}

// --- Exports (ticket 08) ---
let exportQueue: Promise<ExportQueue> | undefined

function useExportQueue(): Promise<ExportQueue> {
  return (exportQueue ??= useQueueBoss()
    .then(createExportQueue)
    .catch((error) => {
      exportQueue = undefined
      throw error
    }))
}

export async function useExports(): Promise<Exports> {
  return createExports({ db: useDb(), storage: useDocumentStorage(), queue: await useExportQueue() })
}

// --- Google Drive and Dropbox Source Connections (ticket 12) ---
let sourceConnections: SourceConnections | undefined
let sourceFetchQueue: Promise<SourceFetchQueue> | undefined

export function useSourceConnections(): SourceConnections {
  return (sourceConnections ??= createSourceConnections({
    db: useDb(),
    encryptionKey: useServerConfig().encryptionKey,
    providers: createSourceProviders(useServerConfig().sources),
  }))
}

function useSourceFetchQueue(): Promise<SourceFetchQueue> {
  return (sourceFetchQueue ??= useQueueBoss()
    .then(createSourceFetchQueue)
    .catch((error) => {
      sourceFetchQueue = undefined
      throw error
    }))
}

export async function useSourceIntake(): Promise<SourceIntake> {
  return createSourceIntake({
    db: useDb(),
    storage: useDocumentStorage(),
    extractionQueue: await useExtractionQueue(),
    fetchQueue: await useSourceFetchQueue(),
    download: useSourceConnections().download,
  })
}
