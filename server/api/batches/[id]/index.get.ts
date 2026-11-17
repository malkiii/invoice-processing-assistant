export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  const found = await useDocumentLibrary().getBatch(session.user.id, getRouterParam(event, 'id')!)
  if (!found) throw createError({ statusCode: 404, statusMessage: 'Batch not found' })
  return found
})
