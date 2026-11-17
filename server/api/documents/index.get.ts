export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  return useDocumentLibrary().listDocuments(session.user.id)
})
