export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  if (!(await useProviderConnections().remove(user.id, getRouterParam(event, 'id')!))) providerNotFound()
  setResponseStatus(event, 204)
  return null
})
