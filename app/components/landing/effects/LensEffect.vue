<script setup lang="ts">
import { sampleInvoiceLines } from '~/lib/cursor-effects/invoice-sample'
import { trackPointer } from '~/lib/cursor-effects/pointer'

// Owns the document stage: a blurred scan, with crisp extracted JSON under the loupe.
defineProps<{ hero: HTMLElement }>()

const RADIUS = 84
const root = ref<HTMLElement>()
const json = ref<HTMLElement>()
const ring = ref<HTMLElement>()

useCursorEffectScope((scope) => {
  const pointer = trackPointer(scope, root.value!)
  let x = -RADIUS * 2
  let y = -RADIUS * 2
  scope.loop(() => {
    const p = pointer.sample()
    const targetX = p.inside ? p.x : -RADIUS * 2
    const targetY = p.inside ? p.y : -RADIUS * 2
    x += (targetX - x) * 0.35
    y += (targetY - y) * 0.35
    json.value!.style.clipPath = `circle(${RADIUS}px at ${x.toFixed(1)}px ${y.toFixed(1)}px)`
    ring.value!.style.transform = `translate3d(${(x - RADIUS).toFixed(1)}px, ${(y - RADIUS).toFixed(1)}px, 0)`
  })
})
</script>

<template>
  <div ref="root" data-effect="lens" class="relative cursor-none">
    <div class="blur-[3px] saturate-50" aria-hidden="true">
      <LandingInvoiceMockup />
    </div>
    <div
      ref="json"
      class="absolute inset-0 flex flex-col justify-center gap-3 rounded-md bg-[#101317] px-7 py-8 text-[12.5px] leading-snug will-change-[clip-path]"
      style="clip-path: circle(0 at -200px -200px)"
      aria-hidden="true"
    >
      <p class="num text-muted-foreground">{</p>
      <p v-for="line in sampleInvoiceLines" :key="line.field" class="num whitespace-pre pl-4">
        <span class="text-primary">"{{ line.field }}"</span><span class="text-muted-foreground">: </span
        ><span class="text-foreground">{{ line.value }}</span><span class="text-muted-foreground">,</span>
      </p>
      <p class="num text-muted-foreground">}</p>
    </div>
    <div
      ref="ring"
      class="pointer-events-none absolute left-0 top-0 rounded-full border-2 border-primary shadow-[0_0_0_6px_rgb(198_244_50/0.12),0_12px_40px_rgb(0_0_0/0.6)] will-change-transform"
      :style="{ width: `${RADIUS * 2}px`, height: `${RADIUS * 2}px`, transform: 'translate3d(-400px,-400px,0)' }"
      aria-hidden="true"
    />
  </div>
</template>
