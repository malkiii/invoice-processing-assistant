import { z } from 'zod'
import { FieldCorrectionError } from '../../../domain/review/values'

const body = z.object({ path: z.string().min(1).max(200), value: z.unknown() })

/** Sets one Field's Corrected Value (`value: null` clears it). Raw Values are never changed. */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const { path, value } = await readValidatedBody(event, body.parse)
  try {
    const updated = await useReview().correctField(user.id, getRouterParam(event, 'id')!, path, value ?? null)
    if (!updated) throw createError({ statusCode: 404, statusMessage: 'Invoice not found' })
    return updated
  } catch (error) {
    if (error instanceof FieldCorrectionError) throw createError({ statusCode: 400, statusMessage: error.message })
    throw error
  }
})
