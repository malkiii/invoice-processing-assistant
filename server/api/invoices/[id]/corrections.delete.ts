import { z } from 'zod'
import { FieldCorrectionError } from '../../../domain/review/values'

/** Reverts one Field (`?path=`) to its Raw Value. */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const { path } = await getValidatedQuery(event, z.object({ path: z.string().min(1).max(200) }).parse)
  try {
    const updated = await useReview().revertField(user.id, getRouterParam(event, 'id')!, path)
    if (!updated) throw createError({ statusCode: 404, statusMessage: 'Invoice not found' })
    return updated
  } catch (error) {
    if (error instanceof FieldCorrectionError) throw createError({ statusCode: 400, statusMessage: error.message })
    throw error
  }
})
