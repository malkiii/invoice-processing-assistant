// Sends signed-in Users away from the sign-in and sign-up pages.
export default defineNuxtRouteMiddleware(async () => {
  const session = await useAuthSession().ensureLoaded()
  if (session) return navigateTo('/app')
})
