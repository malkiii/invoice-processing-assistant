export default defineAdminHandler(async (event, { admin }) => {
  await admin.enableUser(getRouterParam(event, 'id')!)
  return { ok: true }
})
