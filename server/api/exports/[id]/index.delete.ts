/** Removes an Export from the history and deletes its file. */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const deleted = await (await useExports()).remove(user.id, getRouterParam(event, 'id')!)
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Export not found' })
  setResponseStatus(event, 204)
  return null
})
