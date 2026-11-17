import { describe, expect, it } from 'vitest'
import { createEffectScope } from '../../../app/lib/cursor-effects/effect-scope'

describe('createEffectScope', () => {
  it('removes every listener it added when disposed', () => {
    const scope = createEffectScope()
    const target = new EventTarget()
    const seen: string[] = []
    scope.listen(target, 'pointermove', () => seen.push('move'))
    scope.listen(target, 'click', () => seen.push('click'))

    target.dispatchEvent(new Event('pointermove'))
    scope.dispose()
    target.dispatchEvent(new Event('pointermove'))
    target.dispatchEvent(new Event('click'))

    expect(seen).toEqual(['move'])
  })

  it('runs a frame loop every animation frame until disposed', () => {
    const clock = fakeClock()
    const scope = createEffectScope(clock)
    const ticks: number[] = []
    scope.loop((time) => ticks.push(time))

    clock.nextFrame(16)
    clock.nextFrame(32)
    scope.dispose()
    clock.nextFrame(48)

    expect(ticks).toEqual([16, 32])
    expect(clock.pendingFrames()).toBe(0)
  })

  it('clears pending timers when disposed', () => {
    const clock = fakeClock()
    const scope = createEffectScope(clock)
    let fired = false
    scope.timeout(() => (fired = true), 500)

    scope.dispose()
    clock.advance(1000)

    expect(fired).toBe(false)
    expect(clock.pendingTimers()).toBe(0)
  })

  it('runs registered cleanups once, even if disposed twice', () => {
    const scope = createEffectScope(fakeClock())
    let cleaned = 0
    scope.onDispose(() => cleaned++)

    scope.dispose()
    scope.dispose()

    expect(cleaned).toBe(1)
  })

  it('ignores work scheduled after it was disposed', () => {
    const clock = fakeClock()
    const scope = createEffectScope(clock)
    const target = new EventTarget()
    let calls = 0
    scope.dispose()

    scope.listen(target, 'click', () => calls++)
    scope.loop(() => calls++)
    scope.timeout(() => calls++, 10)
    target.dispatchEvent(new Event('click'))
    clock.nextFrame(16)
    clock.advance(20)

    expect(calls).toBe(0)
  })
})

/** A hand-driven stand-in for requestAnimationFrame and setTimeout. */
function fakeClock() {
  let nextId = 1
  let now = 0
  const frames = new Map<number, (time: number) => void>()
  const timers = new Map<number, { at: number; run: () => void }>()

  return {
    requestFrame(callback: (time: number) => void) {
      const id = nextId++
      frames.set(id, callback)
      return id
    },
    cancelFrame(id: number) {
      frames.delete(id)
    },
    setTimer(callback: () => void, ms: number) {
      const id = nextId++
      timers.set(id, { at: now + ms, run: callback })
      return id
    },
    clearTimer(id: number) {
      timers.delete(id)
    },
    nextFrame(time: number) {
      const due = [...frames.values()]
      frames.clear()
      for (const callback of due) callback(time)
    },
    advance(ms: number) {
      now += ms
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id)
          timer.run()
        }
      }
    },
    pendingFrames: () => frames.size,
    pendingTimers: () => timers.size,
  }
}
