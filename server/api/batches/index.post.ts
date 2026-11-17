import { z } from 'zod'
import { MAX_FILES_PER_BATCH } from '../../domain/intake'

const body = z.object({
  files: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(1024),
        size: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(MAX_FILES_PER_BATCH),
})

/** Starts an upload Batch: one Document and one presigned upload URL per file. */
export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  const { files } = await readValidatedBody(event, body.parse)
  const intake = await useIntake()
  return intake.startUploadBatch(session.user.id, files)
})
