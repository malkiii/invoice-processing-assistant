import { gsap } from 'gsap'
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import type { Ref } from 'vue'

export interface LandingMotionContext {
  gsap: typeof gsap
  ScrollTrigger: typeof ScrollTrigger
  SplitText: typeof SplitText
  /** True when the visitor asked for reduced motion: show end states, skip scrubbing and pinning. */
  reduced: boolean
}

let registered = false

/**
 * Runs a landing version's GSAP setup once mounted, scoped to `root` so selector strings
 * only match inside that version. Everything it creates (tweens, ScrollTriggers, SplitText
 * splits) is reverted on unmount, and it reruns when the reduced-motion preference changes.
 */
export function useLandingMotion(
  root: Ref<HTMLElement | undefined>,
  // May return a cleanup for anything GSAP does not own (event listeners, timers).
  setup: (ctx: LandingMotionContext) => void | (() => void),
) {
  let mm: gsap.MatchMedia | undefined

  onMounted(() => {
    if (!registered) {
      gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin, DrawSVGPlugin)
      registered = true
    }
    mm = gsap.matchMedia(root.value)
    mm.add(
      { motion: '(prefers-reduced-motion: no-preference)', reduce: '(prefers-reduced-motion: reduce)' },
      (context) => {
        return setup({ gsap, ScrollTrigger, SplitText, reduced: !!context.conditions?.reduce })
      },
    )
    // Fonts and lazy content shift layout after first paint; re-measure trigger positions.
    document.fonts?.ready.then(() => ScrollTrigger.refresh())
  })

  onBeforeUnmount(() => {
    mm?.revert()
    mm = undefined
  })
}

/** Moves CSS variables `--mx`/`--my` with the pointer, for spotlight and tilt effects. */
export function trackPointer(el: HTMLElement, onMove?: (x: number, y: number) => void) {
  const handler = (e: PointerEvent) => {
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    el.style.setProperty('--mx', `${(x * 100).toFixed(2)}%`)
    el.style.setProperty('--my', `${(y * 100).toFixed(2)}%`)
    onMove?.(x, y)
  }
  el.addEventListener('pointermove', handler)
  return () => el.removeEventListener('pointermove', handler)
}

/** A GSAP function-based value that picks the i-th number for the i-th target. */
export function byIndex(values: number[]) {
  return (i: number) => values[i] ?? 0
}
