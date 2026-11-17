import type { PgBoss } from 'pg-boss'

/** pg-boss queue holding one job per Document waiting to be extracted (ADR 0001). */
export const EXTRACT_DOCUMENT_QUEUE = 'extract-document'

export interface ExtractDocumentJob {
  documentId: string
}

export interface ExtractionQueue {
  enqueue(documentId: string): Promise<void>
}

/** Creates the queue if needed and returns a producer for it. The consumer lives in the worker. */
export async function createExtractionQueue(boss: PgBoss): Promise<ExtractionQueue> {
  await boss.createQueue(EXTRACT_DOCUMENT_QUEUE)
  return {
    async enqueue(documentId) {
      const job: ExtractDocumentJob = { documentId }
      await boss.send(EXTRACT_DOCUMENT_QUEUE, job)
    },
  }
}
