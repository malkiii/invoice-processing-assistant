// Sends signed-in Users to the app: used by "/", sign-in and sign-up.
export default defineNuxtRouteMiddleware(async () => {
  const session = await useAuthSession().ensureLoaded()
  if (session) return navigateTo('/app')
})
