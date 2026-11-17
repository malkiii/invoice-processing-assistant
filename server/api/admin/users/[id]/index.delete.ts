// Deletes the User with all of their data and stored files.
export default defineAdminHandler(async (event, { admin, session }) => {
  await admin.deleteUser({ userId: getRouterParam(event, 'id')!, actorId: session.user.id })
  return { ok: true }
})
