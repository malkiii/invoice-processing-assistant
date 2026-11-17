import { describe, expect, it } from 'vitest'
import { cursorEffectsBlockedReason } from '../../../app/lib/cursor-effects/motion'

describe('cursorEffectsBlockedReason', () => {
  it('allows effects with a fine pointer and no motion preference', () => {
    expect(cursorEffectsBlockedReason({ reducedMotion: false, coarsePointer: false })).toBeNull()
  })

  it('blocks effects when the user prefers reduced motion', () => {
    expect(cursorEffectsBlockedReason({ reducedMotion: true, coarsePointer: false })).toBe('reduced-motion')
  })

  it('blocks effects on a coarse (touch) pointer', () => {
    expect(cursorEffectsBlockedReason({ reducedMotion: false, coarsePointer: true })).toBe('coarse-pointer')
  })

  it('reports reduced motion first when both apply', () => {
    expect(cursorEffectsBlockedReason({ reducedMotion: true, coarsePointer: true })).toBe('reduced-motion')
  })
})
