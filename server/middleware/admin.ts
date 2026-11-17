import { authorizeAdmin, isAdminApiPath } from '../admin/guard'

// Guards every route under /api/admin, whatever its file says: 401 without a
// session, 403 for non-admins. Routes also use `defineAdminHandler`.
export default defineEventHandler(async (event) => {
  if (!isAdminApiPath(event.path)) return
  const result = await authorizeAdmin(useAuth(), event.headers)
  if (!result.allowed) {
    throw createError({
      statusCode: result.statusCode,
      statusMessage: result.statusCode === 401 ? 'Not signed in' : 'Admin only',
    })
  }
  event.context.adminSession = result.session
})
