import { getUserPreferences } from '../../db/user-preferences'
import { DEFAULT_TEMPLATE_ID } from '../../domain/template/default-template'
import { listTemplates } from '../../domain/templates'

/** The User's Templates (built-in first), each marked when it is the User's default. */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const db = useDb()
  const [templates, prefs] = await Promise.all([listTemplates(db, user.id), getUserPreferences(db, user.id)])
  const defaultId = prefs.defaultTemplateId ?? DEFAULT_TEMPLATE_ID
  return templates.map((t) => ({ ...t, isDefault: t.id === defaultId }))
})
