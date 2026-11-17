import { z } from 'zod'

/** "Mark as reviewed" (`reviewed: true`) and its undo. */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const { reviewed } = await readValidatedBody(event, z.object({ reviewed: z.boolean() }).parse)
  const updated = await useReview().setReviewed(user.id, getRouterParam(event, 'id')!, reviewed)
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Invoice not found' })
  return updated
})
