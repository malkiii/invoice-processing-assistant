import { z } from 'zod'
import { MAX_FILES_PER_BATCH } from '../domain/intake'

const body = z.object({
  urls: z.array(z.string().max(4096)).min(1).max(MAX_FILES_PER_BATCH),
})

/** Starts a URL Batch: one Document per URL, downloaded by the worker. */
export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  const { urls } = await readValidatedBody(event, body.parse)
  if (!urls.some((url) => url.trim())) {
    throw createError({ statusCode: 400, statusMessage: 'Enter at least one URL.' })
  }
  const intake = await useUrlIntake()
  return intake.startUrlBatch(session.user.id, urls)
})
