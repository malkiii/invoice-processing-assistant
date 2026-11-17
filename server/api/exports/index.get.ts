/** The downloads history drawer: the User's recent Exports, newest first. */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  return (await useExports()).list(user.id)
})
