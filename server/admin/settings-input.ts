import { z } from 'zod'
import type { InstanceSettings } from '../domain/instance-settings'

const positiveInt = (max: number) => z.number().int().min(1).max(max)

const settingsUpdate = z.strictObject({
  signUpPolicy: z.enum(['open', 'invite-only']).optional(),
  // Stored in a Postgres integer column.
  maxDocumentBytes: positiveInt(2 ** 31 - 1).optional(),
  maxDocumentPages: positiveInt(10_000).optional(),
  maxConcurrentDocumentsPerUser: positiveInt(100).optional(),
})

/** Validates an Admin's partial instance-settings update. */
export function parseSettingsUpdate(
  input: unknown,
): { success: true; data: Partial<InstanceSettings> } | { success: false; error: string } {
  const result = settingsUpdate.safeParse(input)
  if (result.success) return { success: true, data: result.data }
  return { success: false, error: z.prettifyError(result.error) }
}
