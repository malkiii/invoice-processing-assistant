import type { SignUpPolicy } from './sign-up'

/** Instance-wide settings the Admin controls. */
export interface InstanceSettings {
  signUpPolicy: SignUpPolicy
  /** Hard per-Document size limit (ADR 0007). */
  maxDocumentBytes: number
  /** Hard per-Document page limit (ADR 0007). */
  maxDocumentPages: number
  /** How many of one User's Documents the worker extracts at the same time. */
  maxConcurrentDocumentsPerUser: number
}

export const DEFAULT_INSTANCE_SETTINGS: InstanceSettings = {
  signUpPolicy: 'open',
  maxDocumentBytes: 25 * 1024 * 1024,
  maxDocumentPages: 30,
  maxConcurrentDocumentsPerUser: 3,
}
