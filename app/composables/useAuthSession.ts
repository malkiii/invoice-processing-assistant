import { authClient } from '~/lib/auth-client'

type SessionData = typeof authClient.$Infer.Session

/**
 * The current session, fetched once per request on the server (cookies forwarded)
 * and shared with the client through Nuxt state. Call `refresh()` after sign-in/out.
 */
export function useAuthSession() {
  const session = useState<SessionData | null>('auth-session', () => null)
  const loaded = useState('auth-session-loaded', () => false)
  const requestFetch = useRequestFetch()

  async function refresh() {
    session.value = await requestFetch<SessionData | null>('/api/auth/get-session').catch(() => null)
    loaded.value = true
    return session.value
  }

  async function ensureLoaded() {
    return loaded.value ? session.value : refresh()
  }

  return {
    session,
    user: computed(() => session.value?.user ?? null),
    refresh,
    ensureLoaded,
  }
}
