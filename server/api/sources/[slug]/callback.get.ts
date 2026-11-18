import { timingSafeEqual } from 'node:crypto'
import { SOURCE_LABELS } from '../../../domain/source-providers'

const SETTINGS = '/app/settings/sources'

function sameText(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** The provider sends the User back here after consent; saves the Source Connection. */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const kind = sourceKindParam(event)
  const label = SOURCE_LABELS[kind]
  const query = getQuery(event)
  const expected = getCookie(event, SOURCE_STATE_COOKIE)
  deleteCookie(event, SOURCE_STATE_COOKIE, { path: '/api/sources' })
  const back = (params: Record<string, string>) =>
    sendRedirect(event, `${SETTINGS}?${new URLSearchParams(params).toString()}`)

  if (typeof query.error === 'string') {
    return back({ error: `${label} was not connected: access was not granted.` })
  }
  const state = typeof query.state === 'string' ? query.state : ''
  const code = typeof query.code === 'string' ? query.code : ''
  if (!expected || !state || !code || !sameText(expected, `${kind}:${state}`)) {
    return back({ error: `${label} was not connected: the sign-in expired or did not start here. Try again.` })
  }

  try {
    await useSourceConnections().connect(user.id, kind, code)
  } catch (error) {
    console.error(`[sources] connecting ${kind} failed`, error)
    return back({ error: `${label} could not be connected. Try again.` })
  }
  return back({ connected: kind })
})
