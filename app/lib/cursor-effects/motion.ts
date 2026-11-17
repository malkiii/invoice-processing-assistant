export type CursorEffectsBlockedReason = 'reduced-motion' | 'coarse-pointer'

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
export const COARSE_POINTER_QUERY = '(pointer: coarse)'

/** Why cursor effects must stay off on this device, or null when they may run. */
export function cursorEffectsBlockedReason(env: {
  reducedMotion: boolean
  coarsePointer: boolean
}): CursorEffectsBlockedReason | null {
  if (env.reducedMotion) return 'reduced-motion'
  if (env.coarsePointer) return 'coarse-pointer'
  return null
}

export const BLOCKED_REASON_LABEL: Record<CursorEffectsBlockedReason, string> = {
  'reduced-motion': 'Effects are off because your system asks for reduced motion.',
  'coarse-pointer': 'Effects are off on touch screens.',
}
