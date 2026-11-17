import { parseSettingsUpdate } from '../../admin/settings-input'

export default defineAdminHandler(async (event, { admin }) => {
  const parsed = parseSettingsUpdate(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error })
  return admin.updateSettings(parsed.data)
})
