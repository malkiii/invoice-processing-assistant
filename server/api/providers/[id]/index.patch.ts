import { z } from 'zod'

const body = z.object({
  name: z.string().max(200).optional(),
  apiKey: optionalText,
  baseUrl: optionalText,
  defaultModel: optionalText,
})

export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const changes = await readValidatedBody(event, body.parse)
  const updated = await withInputErrors(() =>
    useProviderConnections().update(user.id, getRouterParam(event, 'id')!, changes),
  )
  return updated ?? providerNotFound()
})
