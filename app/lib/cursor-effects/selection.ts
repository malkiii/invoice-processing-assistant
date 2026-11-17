/** The six landing cursor effects, in switcher order. */
export const CURSOR_EFFECTS = ['lens', 'receipt', 'stamp', 'particles', 'ruler', 'scanner'] as const

export type CursorEffectName = (typeof CURSOR_EFFECTS)[number]
export type CursorChoice = CursorEffectName | 'off'

export const CURSOR_CHOICES: readonly CursorChoice[] = [...CURSOR_EFFECTS, 'off']
export const DEFAULT_CURSOR_CHOICE: CursorChoice = 'lens'

/** localStorage key that remembers the last picked effect. */
export const CURSOR_STORAGE_KEY = 'landing-cursor'

export function isCursorChoice(value: unknown): value is CursorChoice {
  return typeof value === 'string' && (CURSOR_CHOICES as readonly string[]).includes(value)
}

type QueryValue = string | null | undefined | readonly (string | null)[]

/** Picks the active effect: a valid `?cursor=` wins, then the remembered choice, then the default. */
export function resolveCursorEffect(input: { query: QueryValue; stored: string | null | undefined }): CursorChoice {
  const query = Array.isArray(input.query) ? input.query[0] : input.query
  if (isCursorChoice(query)) return query
  if (isCursorChoice(input.stored)) return input.stored
  return DEFAULT_CURSOR_CHOICE
}
