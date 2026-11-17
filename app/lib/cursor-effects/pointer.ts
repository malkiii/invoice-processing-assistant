import type { EffectScope } from './effect-scope'

/**
 * Latest pointer position relative to `area`, sampled by the scope's frame loop.
 * Events only store raw client coordinates; the rect is read once per frame, so
 * effects never interleave layout reads with writes.
 */
export interface PointerState {
  /** Position inside the area, in CSS pixels. */
  x: number
  y: number
  width: number
  height: number
  inside: boolean
  /** `performance.now()` of the last movement. */
  movedAt: number
}

export function trackPointer(scope: EffectScope, area: HTMLElement): { state: PointerState; sample(): PointerState } {
  let clientX = 0
  let clientY = 0
  let hasPointer = false
  const state: PointerState = { x: 0, y: 0, width: 0, height: 0, inside: false, movedAt: 0 }

  scope.listen<PointerEvent>(area, 'pointermove', (event) => {
    clientX = event.clientX
    clientY = event.clientY
    hasPointer = true
    state.movedAt = performance.now()
  }, { passive: true })
  scope.listen(area, 'pointerleave', () => (hasPointer = false), { passive: true })

  return {
    state,
    sample() {
      const rect = area.getBoundingClientRect()
      state.width = rect.width
      state.height = rect.height
      state.x = clientX - rect.left
      state.y = clientY - rect.top
      state.inside = hasPointer && state.x >= 0 && state.y >= 0 && state.x <= rect.width && state.y <= rect.height
      return state
    },
  }
}
