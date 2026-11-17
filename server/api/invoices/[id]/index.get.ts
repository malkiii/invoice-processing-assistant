/** The Review screen: the Invoice against its Template Snapshot, plus how to view its Document. */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const found = await useReview().getInvoice(user.id, getRouterParam(event, 'id')!)
  if (!found) throw createError({ statusCode: 404, statusMessage: 'Invoice not found' })
  const library = useDocumentLibrary()
  const doc = await library.getDocument(user.id, found.documentId)
  const fileUrl = await library.fileUrl(user.id, found.documentId)
  return { ...found, documentMimeType: doc?.mimeType ?? null, fileUrl }
})
