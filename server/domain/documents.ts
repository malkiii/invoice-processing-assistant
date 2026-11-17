/**
 * Document lifecycle: `uploading → queued → processing → extracted | failed`.
 * `uploading` covers the window between a presigned upload URL being issued and the server
 * confirming the bytes; every other status is from the spec.
 */
export type DocumentStatus = 'uploading' | 'queued' | 'processing' | 'extracted' | 'failed'

export type DocumentSource = 'upload' | 'url' | 'google-drive' | 'dropbox'

/** A Document status change, as streamed to the UI. */
export interface DocumentStatusEvent {
  documentId: string
  batchId: string
  userId: string
  status: DocumentStatus
  failureReason: string | null
}
