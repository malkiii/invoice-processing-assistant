import { z } from 'zod'

const price = z.object({ inputPerMillion: z.number().min(0), outputPerMillion: z.number().min(0) })
const body = z.object({
  modelId: z.string().min(1).max(500),
  capabilityOverride: capabilitySchema.nullable().optional(),
  price: price.nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const { modelId, ...changes } = await readValidatedBody(event, body.parse)
  const saved = await withInputErrors(() =>
    useProviderConnections().saveModelSetting(user.id, getRouterParam(event, 'id')!, modelId, changes),
  )
  return saved ?? providerNotFound()
})
