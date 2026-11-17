/** The Document plus a short-lived URL for viewing its file. */
export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  const id = getRouterParam(event, 'id')!
  const library = useDocumentLibrary()
  const found = await library.getDocument(session.user.id, id)
  if (!found) throw createError({ statusCode: 404, statusMessage: 'Document not found' })
  const fileUrl = found.status === 'failed' ? null : await library.fileUrl(session.user.id, id)
  return { ...found, fileUrl }
})
