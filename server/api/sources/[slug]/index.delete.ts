/** Disconnects a source: revokes access at the provider and forgets the tokens. */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const kind = sourceKindParam(event)
  if (!(await useSourceConnections().disconnect(user.id, kind))) {
    throw createError({ statusCode: 404, statusMessage: 'This source is not connected.' })
  }
  setResponseStatus(event, 204)
  return null
})
