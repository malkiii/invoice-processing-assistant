import { SourceConnectionUnavailableError } from '../../../lib/source-connections'

/**
 * A fresh access token for the Google Picker, which runs in the User's browser. With the
 * `drive.file` scope it only reaches files the User picks (or the app created).
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const kind = sourceKindParam(event)
  if (kind !== 'google-drive') throw createError({ statusCode: 404, statusMessage: 'Not found' })
  setHeader(event, 'cache-control', 'no-store')
  try {
    return { accessToken: await useSourceConnections().accessToken(user.id, kind) }
  } catch (error) {
    if (error instanceof SourceConnectionUnavailableError) {
      throw createError({ statusCode: 409, statusMessage: error.message })
    }
    throw error
  }
})
