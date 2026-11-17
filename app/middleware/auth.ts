// Guards the /app area: unauthenticated visitors go to sign-in and come back afterwards.
export default defineNuxtRouteMiddleware(async (to) => {
  const session = await useAuthSession().ensureLoaded()
  if (!session) {
    return navigateTo({ path: '/auth/sign-in', query: { redirect: to.fullPath } })
  }
})
