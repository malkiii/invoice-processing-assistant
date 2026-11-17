import { z } from 'zod'
import { updateUserPreferences } from '../db/user-preferences'

const body = z.object({
  defaultConnectionId: z.string().max(100).nullable().optional(),
  defaultModel: z.string().max(500).nullable().optional(),
  defaultTemplateId: z.string().max(100).nullable().optional(),
  theme: z.enum(['noir', 'day']).optional(),
  autoDeleteAfterDays: z.number().int().min(1).max(3650).nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const changes = await readValidatedBody(event, body.parse)
  return withInputErrors(() => updateUserPreferences(useDb(), user.id, changes))
})
