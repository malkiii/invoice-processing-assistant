import { PROVIDER_KINDS, PROVIDER_PRESETS } from '../../domain/provider-presets'

export default defineEventHandler(async (event) => {
  await requireSession(event)
  return PROVIDER_KINDS.map((kind) => PROVIDER_PRESETS[kind])
})
