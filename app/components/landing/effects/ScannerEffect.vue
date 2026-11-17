<script setup lang="ts">
import { trackPointer } from '~/lib/cursor-effects/pointer'

// Owns the document stage: a light band follows the cursor's Y and digitises the lines it passes.
defineProps<{ hero: HTMLElement }>()

const BAND = 56
const root = ref<HTMLElement>()
const band = ref<HTMLElement>()

useCursorEffectScope((scope) => {
  const area = root.value!
  const pointer = trackPointer(scope, area)
  const lines = [...area.querySelectorAll<HTMLElement>('[data-scan-line]')]
  let centres: number[] = []
  const digitised = lines.map(() => false)

  // Line positions are measured only when the stage resizes, never per frame.
  const measure = () => {
    centres = lines.map((line) => line.offsetTop + line.offsetHeight / 2)
  }
  measure()
  const observer = new ResizeObserver(measure)
  observer.observe(area)
  scope.onDispose(() => observer.disconnect())

  let y = -BAND
  let shown = false
  scope.loop(() => {
    const p = pointer.sample()
    if (p.inside) {
      y += (p.y - y) * 0.3
      if (!shown) {
        band.value!.style.opacity = '1'
        shown = true
      }
    } else if (shown) {
      band.value!.style.opacity = '0'
      shown = false
    }
    band.value!.style.transform = `translate3d(0, ${(y - BAND / 2).toFixed(1)}px, 0)`
    if (!p.inside) return
    centres.forEach((centre, index) => {
      if (!digitised[index] && Math.abs(centre - y) < BAND / 2) {
        digitised[index] = true
        lines[index]!.classList.add('is-digitised')
      }
    })
  })
  scope.onDispose(() => lines.forEach((line) => line.classList.remove('is-digitised')))
})
</script>

<template>
  <div ref="root" data-effect="scanner" class="scanner relative overflow-hidden rounded-md">
    <LandingInvoiceMockup />
    <div
      ref="band"
      class="pointer-events-none absolute inset-x-0 top-0 opacity-0 transition-opacity duration-200 will-change-transform"
      :style="{ height: `${BAND}px` }"
      aria-hidden="true"
    >
      <div class="absolute inset-0 bg-gradient-to-b from-transparent via-primary/25 to-transparent" />
      <div class="absolute inset-x-0 top-1/2 h-px bg-primary shadow-[0_0_16px_2px_rgb(198_244_50/0.7)]" />
    </div>
  </div>
</template>

<style scoped>
.scanner :deep(.scan-line) {
  transition:
    color 300ms ease,
    background-color 300ms ease;
}
.scanner :deep(.scan-line.is-digitised) {
  color: var(--ledger-accent-ink);
  background-color: rgb(198 244 50 / 0.85);
  border-radius: 2px;
}
.scanner :deep(.scan-line.is-digitised)::after {
  content: '  ← ' attr(data-field);
  font-size: 10px;
  opacity: 0.7;
}
</style>
