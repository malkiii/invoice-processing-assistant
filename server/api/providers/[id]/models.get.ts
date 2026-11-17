/** The provider's model list, or `ok: false` so the UI falls back to free text. */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  return useProviderConnections().listModels(user.id, getRouterParam(event, 'id')!)
})
