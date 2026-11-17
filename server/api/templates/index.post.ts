import { z } from 'zod'
import { cloneTemplate, createTemplate } from '../../domain/templates'

const body = z.union([
  z.object({ cloneFrom: z.string().min(1).max(100) }),
  z.object({ name: z.string().max(500), fields: z.array(z.unknown()).max(500) }),
])

/** Creates a Template from Fields, or clones one the User can use (`cloneFrom`). */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const input = await readValidatedBody(event, body.parse)
  if ('cloneFrom' in input) return (await cloneTemplate(useDb(), user.id, input.cloneFrom)) ?? templateNotFound()
  return withTemplateErrors(() => createTemplate(useDb(), user.id, input))
})
