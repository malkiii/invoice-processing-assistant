import { z } from 'zod'
import { PROVIDER_KINDS } from '../../domain/provider-presets'

const body = z.object({
  kind: z.enum(PROVIDER_KINDS),
  name: z.string().max(200).default(''),
  apiKey: optionalText,
  baseUrl: optionalText,
  defaultModel: optionalText,
})

export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const input = await readValidatedBody(event, body.parse)
  return withInputErrors(() => useProviderConnections().create(user.id, input))
})
