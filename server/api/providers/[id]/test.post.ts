import { z } from 'zod'

const body = z.object({ model: optionalText })

/** "Test connection": a tiny call with the stored key. The key itself never leaves the server. */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const { model } = await readValidatedBody(event, (b) => body.parse(b ?? {}))
  return useProviderConnections().test(user.id, getRouterParam(event, 'id')!, model)
})
