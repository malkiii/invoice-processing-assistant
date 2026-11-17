import type { H3Event } from 'h3'

/** Returns the signed-in User's session or throws 401. Use in every `/api` route that needs a User. */
export async function requireSession(event: H3Event) {
  const session = await useAuth().api.getSession({ headers: event.headers })
  if (!session) throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  return session
}

/** Like `requireSession`, but also throws 403 unless the User is the Admin. */
export async function requireAdmin(event: H3Event) {
  const session = await requireSession(event)
  if (session.user.role !== 'admin') throw createError({ statusCode: 403, statusMessage: 'Admin only' })
  return session
}
