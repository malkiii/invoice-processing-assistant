import { z } from 'zod'
import { PROVIDER_KINDS } from '../../domain/provider-presets'

const body = z.object({
  kind: z.enum(PROVIDER_KINDS),
  apiKey: optionalText,
  baseUrl: optionalText,
  connectionId: optionalText,
})

/** Checks credentials typed into the form (not saved yet) by fetching the provider's model list. */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const input = await readValidatedBody(event, body.parse)
  return withInputErrors(() => useProviderConnections().checkCredentials(user.id, input))
})
