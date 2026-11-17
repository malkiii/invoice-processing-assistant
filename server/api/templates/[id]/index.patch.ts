import { z } from 'zod'
import { updateTemplate } from '../../../domain/templates'

const body = z.object({
  name: z.string().max(500).optional(),
  fields: z.array(z.unknown()).max(500).optional(),
})

/** Edits an own Template. Existing Extractions keep their Template Snapshot (ADR 0006). */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const id = getRouterParam(event, 'id')!
  const changes = await readValidatedBody(event, body.parse)
  return (await withTemplateErrors(() => updateTemplate(useDb(), user.id, id, changes))) ?? templateNotFound()
})
