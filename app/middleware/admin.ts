// Keeps non-admins out of /admin in the UI. The server enforces it on every /api/admin route.
export default defineNuxtRouteMiddleware(async (to) => {
  const session = await useAuthSession().ensureLoaded()
  if (!session) return navigateTo({ path: '/auth/sign-in', query: { redirect: to.fullPath } })
  if (session.user.role !== 'admin') return navigateTo('/app')
})
