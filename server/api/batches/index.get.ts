export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  return useDocumentLibrary().listBatches(session.user.id)
})
