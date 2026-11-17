<script setup lang="ts">
import { trackPointer } from '~/lib/cursor-effects/pointer'

// A thermal receipt trails the cursor, printing while it moves; it tears off when the cursor rests.
const props = defineProps<{ hero: HTMLElement }>()

const LENGTH = 230
const IDLE_MS = 650
const TEAR_MS = 700

const holder = ref<HTMLElement>()
const paper = ref<HTMLElement>()

useCursorEffectScope((scope) => {
  const pointer = trackPointer(scope, props.hero)
  let x = 0
  let y = 0
  let lastX = 0
  let lastY = 0
  let printed = 0
  let tearing = false
  let placed = false

  function tear() {
    tearing = true
    const el = paper.value!
    el.style.transition = `transform ${TEAR_MS}ms cubic-bezier(.4,0,.8,.6), opacity ${TEAR_MS}ms ease-in`
    el.style.transform = `translate3d(14px, ${printed - LENGTH + 90}px, 0) rotate(14deg)`
    el.style.opacity = '0'
    scope.timeout(() => {
      el.style.transition = 'none'
      el.style.opacity = '1'
      printed = 0
      tearing = false
    }, TEAR_MS)
  }

  scope.loop((now) => {
    const p = pointer.sample()
    holder.value!.style.opacity = p.inside ? '1' : '0'
    if (!p.inside) return
    if (!placed) {
      x = lastX = p.x
      y = lastY = p.y
      placed = true
    }
    x += (p.x - x) * 0.22
    y += (p.y - y) * 0.22
    holder.value!.style.transform = `translate3d(${(x + 18).toFixed(1)}px, ${(y + 14).toFixed(1)}px, 0)`

    const travelled = Math.hypot(x - lastX, y - lastY)
    lastX = x
    lastY = y
    if (tearing) return
    if (travelled > 0.5) printed = Math.min(LENGTH, printed + travelled * 0.45)
    else if (printed > 24 && now - p.movedAt > IDLE_MS) return tear()

    // Longer paper curls further back.
    const curl = (printed / LENGTH) * 22
    paper.value!.style.transform = `translate3d(0, ${(printed - LENGTH).toFixed(1)}px, 0) perspective(500px) rotateX(${curl.toFixed(1)}deg)`
  })
})
</script>

<template>
  <div ref="holder" data-effect="receipt" class="absolute left-0 top-0 opacity-0 transition-opacity duration-150 will-change-transform" aria-hidden="true">
    <div class="relative z-10 h-2 w-[164px] -translate-x-[7px] rounded-full bg-[#2a2f37] shadow-[0_2px_6px_rgb(0_0_0/0.6)]" />
    <div class="w-[150px] overflow-hidden" :style="{ height: `${LENGTH}px` }">
      <div
        ref="paper"
        class="receipt-paper num flex flex-col gap-1 px-3 pb-5 pt-3 text-[10px] leading-tight text-[#22262d] will-change-transform"
        :style="{ height: `${LENGTH}px`, transform: `translate3d(0, ${-LENGTH}px, 0)`, transformOrigin: 'top center' }"
      >
        <p class="text-center font-semibold tracking-[0.2em]">EXTRACTED</p>
        <p class="text-center opacity-60">INV-2026-0418</p>
        <p class="my-1 border-t border-dashed border-[#22262d]/40" />
        <p class="flex justify-between"><span>vendor</span><span>Northwind</span></p>
        <p class="flex justify-between"><span>date</span><span>2026-11-14</span></p>
        <p class="flex justify-between"><span>paper ×40</span><span>480.00</span></p>
        <p class="flex justify-between"><span>toner ×6</span><span>553.33</span></p>
        <p class="flex justify-between"><span>vat 20%</span><span>206.67</span></p>
        <p class="my-1 border-t border-dashed border-[#22262d]/40" />
        <p class="flex justify-between font-semibold"><span>TOTAL EUR</span><span>1,240.00</span></p>
        <p class="mt-1 text-center opacity-60">checks passed ✓</p>
        <p class="barcode mt-auto h-6" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.receipt-paper {
  background: linear-gradient(180deg, #f4f1e8 0%, #ebe7da 80%, #d9d4c4 100%);
  /* Torn, zigzag bottom edge. */
  mask:
    linear-gradient(#000 0 0) top / 100% calc(100% - 6px) no-repeat,
    conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) bottom / 10px 6px repeat-x;
  box-shadow: 0 10px 24px rgb(0 0 0 / 0.5);
}
.barcode {
  background: repeating-linear-gradient(90deg, #22262d 0 2px, transparent 2px 3px, #22262d 3px 4px, transparent 4px 7px);
}
</style>
