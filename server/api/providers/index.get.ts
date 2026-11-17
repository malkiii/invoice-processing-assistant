export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  return useProviderConnections().list(user.id)
})
