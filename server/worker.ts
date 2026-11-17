// Worker entry point. Bundled separately from Nuxt (scripts/build-worker.mjs)
// and run in the `worker` container from the same image as the app.
import { createDatabase } from './db/client'
import { createChecksRunner } from './domain/checks/recheck'
import { createExtractionRunner } from './domain/extraction/runner'
import { createPdftoppmRasterizer } from './domain/extraction/rasterize'
import { createS3Storage } from './domain/storage'
import { readAppConfig } from './lib/config'
import { createProviderConnections } from './lib/provider-connections'
import { readStorageConfig } from './lib/storage-config'
import { startWorker } from './worker/start'
import { startUrlFetching } from './worker/url-fetch'
import { startExportGeneration } from './worker/exports'

const config = readAppConfig()
const { db, close } = createDatabase(config.databaseUrl)
const storage = createS3Storage(readStorageConfig())
const runner = createExtractionRunner({
  db,
  storage,
  providers: createProviderConnections({ db, encryptionKey: config.encryptionKey }),
  rasterizePdf: createPdftoppmRasterizer(),
  checks: createChecksRunner(db),
})
const concurrency = Number(process.env.WORKER_CONCURRENCY) || undefined
const worker = await startWorker({ databaseUrl: config.databaseUrl, extraction: { runner, concurrency } })
const stopUrlFetching = await startUrlFetching(worker.boss, { databaseUrl: config.databaseUrl })
await startExportGeneration(worker.boss, { db, storage })
console.log('[worker] connected to pg-boss, waiting for jobs')

let stopping = false
async function shutdown(signal: string) {
  if (stopping) return
  stopping = true
  console.log(`[worker] ${signal} received, stopping`)
  await worker.stop()
  await stopUrlFetching()
  await close()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
