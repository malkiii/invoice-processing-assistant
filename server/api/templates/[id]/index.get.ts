import { findUsableTemplate } from '../../../domain/templates'

export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const id = getRouterParam(event, 'id')!
  return (await findUsableTemplate(useDb(), user.id, id)) ?? templateNotFound()
})
