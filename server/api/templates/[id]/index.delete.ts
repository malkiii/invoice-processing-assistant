import { deleteTemplate } from '../../../domain/templates'

export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const id = getRouterParam(event, 'id')!
  if (!(await withTemplateErrors(() => deleteTemplate(useDb(), user.id, id)))) templateNotFound()
  return { ok: true }
})
