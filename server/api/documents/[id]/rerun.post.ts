import { z } from 'zod'
import { RerunError } from '../../../domain/review/rerun'

const body = z.object({
  connectionId: z.string().max(100).optional(),
  modelId: z.string().max(200).optional(),
  templateId: z.string().max(100).optional(),
})

/** Re-run: queue a new Extraction of the Document, which becomes the Current Extraction (ADR 0005). */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const choice = await readValidatedBody(event, body.parse)
  try {
    await (await useReextraction()).rerun(user.id, getRouterParam(event, 'id')!, choice)
  } catch (error) {
    if (error instanceof RerunError) throw createError({ statusCode: 409, statusMessage: error.message })
    throw error
  }
  setResponseStatus(event, 202)
  return { queued: true }
})
