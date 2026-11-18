import { z } from 'zod'
import { MAX_FILES_PER_BATCH } from '../domain/intake'
import { SOURCE_KINDS } from '../domain/source-providers'
import { SourceConnectionUnavailableError } from '../lib/source-connections'

const body = z.object({
  source: z.enum(SOURCE_KINDS),
  files: z
    .array(z.object({ id: z.string().min(1).max(512), name: z.string().min(1).max(1024) }))
    .min(1)
    .max(MAX_FILES_PER_BATCH),
})

/** Starts a Batch from files picked in Google Drive or Dropbox; the worker downloads each one. */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const { source, files } = await readValidatedBody(event, body.parse)
  try {
    // Refuses a source that is not enabled, not connected or broken, with the reason.
    await useSourceConnections().accessToken(user.id, source)
  } catch (error) {
    if (error instanceof SourceConnectionUnavailableError) {
      throw createError({ statusCode: 409, statusMessage: error.message })
    }
    throw error
  }
  const intake = await useSourceIntake()
  return intake.startSourceBatch(user.id, source, files)
})
