/**
 * Collects everything a cursor effect starts (listeners, animation frames, timers)
 * so one `dispose()` on unmount tears it all down. After disposal, new work is ignored.
 */
export interface EffectScope {
  listen<E extends Event = Event>(
    target: EventTarget,
    type: string,
    handler: (event: E) => void,
    options?: AddEventListenerOptions,
  ): void
  /** Calls `tick` on every animation frame until the scope is disposed. */
  loop(tick: (time: number) => void): void
  timeout(callback: () => void, ms: number): void
  /** Registers any other teardown (observers, canvas contexts). */
  onDispose(cleanup: () => void): void
  readonly disposed: boolean
  dispose(): void
}

export interface EffectClock {
  requestFrame(callback: (time: number) => void): number
  cancelFrame(id: number): void
  setTimer(callback: () => void, ms: number): number
  clearTimer(id: number): void
}

const browserClock: EffectClock = {
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
  setTimer: (callback, ms) => setTimeout(callback, ms) as unknown as number,
  clearTimer: (id) => clearTimeout(id),
}

export function createEffectScope(clock: EffectClock = browserClock): EffectScope {
  const cleanups = new Set<() => void>()
  let disposed = false

  function track(cleanup: () => void) {
    cleanups.add(cleanup)
    return () => cleanups.delete(cleanup)
  }

  return {
    get disposed() {
      return disposed
    },
    listen(target, type, handler, options) {
      if (disposed) return
      const listener = handler as EventListener
      target.addEventListener(type, listener, options)
      track(() => target.removeEventListener(type, listener, options))
    },
    loop(tick) {
      if (disposed) return
      let id = 0
      const frame = (time: number) => {
        id = clock.requestFrame(frame)
        tick(time)
      }
      id = clock.requestFrame(frame)
      track(() => clock.cancelFrame(id))
    },
    timeout(callback, ms) {
      if (disposed) return
      const untrack = track(() => clock.clearTimer(id))
      const id = clock.setTimer(() => {
        untrack()
        callback()
      }, ms)
    },
    onDispose(cleanup) {
      if (disposed) return
      track(cleanup)
    },
    dispose() {
      disposed = true
      for (const cleanup of cleanups) cleanup()
      cleanups.clear()
    },
  }
}
