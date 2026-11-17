import { isUuid } from '../../../domain/document-library'
import { DocumentNotFoundError } from '../../../domain/intake'

/** Called by the browser after its presigned upload finished (or failed): checks the file and queues it. */
export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  const id = getRouterParam(event, 'id')!
  if (!isUuid(id)) throw createError({ statusCode: 404, statusMessage: 'Document not found' })
  const intake = await useIntake()
  try {
    return await intake.confirmUpload(session.user.id, id)
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: 'Document not found' })
    }
    throw error
  }
})
