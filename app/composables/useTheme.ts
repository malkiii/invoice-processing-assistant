export type ThemeName = 'noir' | 'day'

/**
 * Ledger Noir (default) or Ledger Day. Stored in a cookie so the server renders
 * the right theme on first paint. A per-User preference arrives with Settings → Preferences.
 */
export function useTheme() {
  const theme = useCookie<ThemeName>('theme', {
    default: () => 'noir',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })

  function toggle() {
    theme.value = theme.value === 'noir' ? 'day' : 'noir'
  }

  return { theme, toggle }
}
