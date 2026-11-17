/** What the Re-run dialog needs besides Provider Connections, Templates and preferences. */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const reextraction = await useReextraction()
  return { hasCorrections: await reextraction.currentHasCorrections(user.id, getRouterParam(event, 'id')!) }
})
