import { SOURCE_KINDS, SOURCE_LABELS } from '../../domain/source-providers'

/**
 * The Source Connection providers this instance offers, each with the User's connection (if any)
 * and the browser-safe values its picker needs.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const config = useServerConfig().sources
  const connections = await useSourceConnections().list(user.id)
  const drive = config['google-drive']
  return SOURCE_KINDS.map((kind) => ({
    kind,
    slug: SOURCE_SLUGS[kind],
    label: SOURCE_LABELS[kind],
    enabled: Boolean(config[kind]),
    connection: connections.find((c) => c.kind === kind) ?? null,
    picker:
      kind === 'google-drive'
        ? drive && { apiKey: drive.pickerApiKey, appId: drive.pickerAppId }
        : config.dropbox && { appKey: config.dropbox.clientId },
  }))
})
