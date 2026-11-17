import { z } from 'zod'

/** Switches which Extraction of the Document is current. */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const { extractionId } = await readValidatedBody(event, z.object({ extractionId: z.string().max(64) }).parse)
  const ok = await (await useReextraction()).setCurrentExtraction(user.id, getRouterParam(event, 'id')!, extractionId)
  if (!ok) throw createError({ statusCode: 404, statusMessage: 'Extraction not found' })
  return { ok }
})
