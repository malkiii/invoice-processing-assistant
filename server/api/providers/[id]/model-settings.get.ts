import { z } from 'zod'

const query = z.object({ model: z.string().min(1).max(500).optional() })

/** All saved model settings, or (with `?model=`) the effective setting for one model. */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const { model } = await getValidatedQuery(event, query.parse)
  const id = getRouterParam(event, 'id')!
  const service = useProviderConnections()
  if (model) return (await service.modelSetting(user.id, id, model)) ?? providerNotFound()
  return service.modelSettings(user.id, id)
})
