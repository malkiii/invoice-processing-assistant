/** Redirects to a short-lived URL that downloads the Export file. */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const url = await (await useExports()).downloadUrl(user.id, getRouterParam(event, 'id')!)
  if (!url) throw createError({ statusCode: 404, statusMessage: 'Export not found or not ready' })
  return sendRedirect(event, url, 302)
})
