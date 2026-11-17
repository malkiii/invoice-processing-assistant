import { z } from 'zod'

/** The next unreviewed Invoice after `after` (keyboard "next unreviewed"). */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const { after } = await getValidatedQuery(event, z.object({ after: z.string().max(64).optional() }).parse)
  return { id: await useReview().nextUnreviewed(user.id, after) }
})
