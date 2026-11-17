/** What the Re-run dialog needs besides Provider Connections and preferences. */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const reextraction = await useReextraction()
  const id = getRouterParam(event, 'id')!
  const [templates, hasCorrections] = await Promise.all([
    reextraction.templateChoices(user.id),
    reextraction.currentHasCorrections(user.id, id),
  ])
  return { templates, hasCorrections }
})
