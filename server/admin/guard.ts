import type { Auth } from '../lib/auth'

type Session = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>

export type AdminAuthorization =
  | { allowed: true; session: Session }
  | { allowed: false; statusCode: 401 | 403 }

/** Decides whether a request may use the admin API: 401 without a session, 403 unless the Admin. */
export async function authorizeAdmin(auth: Auth, headers: Headers): Promise<AdminAuthorization> {
  const session = await auth.api.getSession({ headers })
  if (!session) return { allowed: false, statusCode: 401 }
  if (session.user.role !== 'admin') return { allowed: false, statusCode: 403 }
  return { allowed: true, session }
}

/**
 * Whether a request path falls under `/api/admin`. Normalises case, repeated
 * slashes, dot segments and percent-encoding first, so no spelling of an admin
 * route slips past the middleware guard.
 */
export function isAdminApiPath(rawPath: string): boolean {
  let path = rawPath.split('?')[0]!
  try {
    path = decodeURIComponent(path)
  } catch {
    // Malformed encoding: judge the raw path.
  }
  path = new URL(path.replace(/\/{2,}/g, '/'), 'http://localhost').pathname.toLowerCase()
  return path === '/api/admin' || path.startsWith('/api/admin/')
}
