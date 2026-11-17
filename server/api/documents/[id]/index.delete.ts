/** Deletes the Document and its stored file. */
export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  const deleted = await useDocumentLibrary().deleteDocument(session.user.id, getRouterParam(event, 'id')!)
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Document not found' })
  setResponseStatus(event, 204)
  return null
})
