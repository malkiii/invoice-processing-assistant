import pg from 'pg'
import type { DocumentStatusEvent } from './documents'

/**
 * Postgres channel a database trigger notifies on every Document insert and status change
 * (migration `0002_document_status_notify`), so changes made by the app and the worker alike
 * reach the UI without either one publishing explicitly.
 */
export const DOCUMENT_STATUS_CHANNEL = 'document_status'

export interface DocumentStatusListener {
  /** Registers a handler; returns a function that removes it. */
  subscribe(handler: (event: DocumentStatusEvent) => void): () => void
  close(): Promise<void>
}

/** Opens one dedicated connection that LISTENs for Document status changes and fans them out. */
export async function listenToDocumentStatus(databaseUrl: string): Promise<DocumentStatusListener> {
  const handlers = new Set<(event: DocumentStatusEvent) => void>()
  const client = new pg.Client({ connectionString: databaseUrl })
  client.on('error', (error) => console.error('[document-events] connection error', error))
  client.on('notification', (message) => {
    if (message.channel !== DOCUMENT_STATUS_CHANNEL || !message.payload) return
    const event = JSON.parse(message.payload) as DocumentStatusEvent
    for (const handler of handlers) handler(event)
  })
  await client.connect()
  await client.query(`LISTEN ${DOCUMENT_STATUS_CHANNEL}`)

  return {
    subscribe(handler) {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
    async close() {
      handlers.clear()
      await client.end()
    },
  }
}
