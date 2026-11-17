export default defineAdminHandler(async (event, { admin }) => {
  await admin.revokeInvite(getRouterParam(event, 'id')!)
  return { ok: true }
})
