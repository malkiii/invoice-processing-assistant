import { randomBytes } from 'node:crypto'

/** Starts connecting a source: remembers a random `state` and sends the browser to the consent screen. */
export default defineEventHandler(async (event) => {
  await requireSession(event)
  const kind = sourceKindParam(event)
  const state = randomBytes(24).toString('base64url')
  setCookie(event, SOURCE_STATE_COOKIE, `${kind}:${state}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: useServerConfig().authUrl.startsWith('https:'),
    path: '/api/sources',
    maxAge: 600,
  })
  return sendRedirect(event, useSourceConnections().authorizeUrl(kind, state))
})
