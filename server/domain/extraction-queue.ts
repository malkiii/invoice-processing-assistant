import type { PgBoss } from 'pg-boss'

/** pg-boss queue holding one job per Document waiting to be extracted (ADR 0001). */
export const EXTRACT_DOCUMENT_QUEUE = 'extract-document'

/** An explicit Provider Connection, model and Template (Re-run). Omitted parts use the User's defaults. */
export interface ExtractionChoice {
  connectionId?: string
  modelId?: string
  templateId?: string
}

export interface ExtractDocumentJob extends ExtractionChoice {
  documentId: string
}

export interface ExtractionQueue {
  enqueue(documentId: string, choice?: ExtractionChoice): Promise<void>
}

/** Creates the queue if needed and returns a producer for it. The consumer lives in the worker. */
export async function createExtractionQueue(boss: PgBoss): Promise<ExtractionQueue> {
  await boss.createQueue(EXTRACT_DOCUMENT_QUEUE)
  return {
    async enqueue(documentId, choice = {}) {
      const job: ExtractDocumentJob = { documentId, ...choice }
      await boss.send(EXTRACT_DOCUMENT_QUEUE, job)
    },
  }
}
