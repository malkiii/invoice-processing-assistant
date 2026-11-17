export default defineAdminHandler(async (event, { admin, session }) => {
  await admin.disableUser({ userId: getRouterParam(event, 'id')!, actorId: session.user.id })
  return { ok: true }
})
