// Worker entry point. Bundled separately from Nuxt (scripts/build-worker.mjs)
// and run in the `worker` container from the same image as the app.
import { readAppConfig } from './lib/config'
import { startWorker } from './worker/start'
import { startUrlFetching } from './worker/url-fetch'

const config = readAppConfig()
const worker = await startWorker({ databaseUrl: config.databaseUrl })
const stopUrlFetching = await startUrlFetching(worker.boss, { databaseUrl: config.databaseUrl })
console.log('[worker] connected to pg-boss, waiting for jobs')

let stopping = false
async function shutdown(signal: string) {
  if (stopping) return
  stopping = true
  console.log(`[worker] ${signal} received, stopping`)
  await worker.stop()
  await stopUrlFetching()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
