<script setup lang="ts">
import { trackPointer } from '~/lib/cursor-effects/pointer'

// A ledger-ruled crosshair follows the cursor; hovered hero text shows its extracted field.
const props = defineProps<{ hero: HTMLElement }>()

const root = ref<HTMLElement>()
const horizontal = ref<HTMLElement>()
const vertical = ref<HTMLElement>()
const readout = ref<HTMLElement>()
const tip = ref<HTMLElement>()
const field = ref<string | null>(null)

useCursorEffectScope((scope) => {
  const pointer = trackPointer(scope, props.hero)

  scope.listen<PointerEvent>(props.hero, 'pointerover', (event) => {
    const target = (event.target as Element | null)?.closest<HTMLElement>('[data-field-tip]')
    field.value = target?.dataset.fieldTip ?? null
  }, { passive: true })

  let lastLabel = ''
  scope.loop(() => {
    const p = pointer.sample()
    root.value!.style.opacity = p.inside ? '1' : '0'
    if (!p.inside) return
    const x = p.x.toFixed(0)
    const y = p.y.toFixed(0)
    horizontal.value!.style.transform = `translate3d(0, ${y}px, 0)`
    vertical.value!.style.transform = `translate3d(${x}px, 0, 0)`
    readout.value!.style.transform = `translate3d(${p.x + 10}px, ${p.y + 8}px, 0)`
    tip.value!.style.transform = `translate3d(${p.x + 14}px, ${p.y - 34}px, 0)`
    // Only touch text when it changes.
    const label = `x ${x.padStart(4, '0')} · y ${y.padStart(4, '0')}`
    if (label !== lastLabel) {
      readout.value!.textContent = label
      lastLabel = label
    }
  })
})
</script>

<template>
  <div ref="root" data-effect="ruler" class="absolute inset-0 opacity-0 transition-opacity duration-150" aria-hidden="true">
    <div ref="horizontal" class="ruler-h absolute inset-x-0 top-0 h-px will-change-transform" />
    <div ref="vertical" class="ruler-v absolute inset-y-0 left-0 w-px will-change-transform" />
    <div
      ref="readout"
      class="num absolute left-0 top-0 rounded-sm bg-background/80 px-1 text-[10px] text-muted-foreground will-change-transform"
    />
    <div ref="tip" class="absolute left-0 top-0 will-change-transform">
      <div
        v-if="field"
        class="num whitespace-nowrap rounded-md border border-primary/60 bg-card px-2 py-1 text-xs text-primary shadow-lg"
      >
        {{ field }}
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Ledger ruling: an accent line with small ticks every 8px and a stronger tick every 40px. */
.ruler-h {
  background: var(--ledger-accent);
  box-shadow: 0 0 8px rgb(198 244 50 / 0.5);
}
.ruler-h::after {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 7px;
  background:
    repeating-linear-gradient(90deg, rgb(198 244 50 / 0.9) 0 1px, transparent 1px 40px),
    repeating-linear-gradient(90deg, rgb(198 244 50 / 0.45) 0 1px, transparent 1px 8px) top / 100% 4px no-repeat;
}
.ruler-v {
  background: var(--ledger-accent);
  box-shadow: 0 0 8px rgb(198 244 50 / 0.5);
}
.ruler-v::after {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 7px;
  background:
    repeating-linear-gradient(180deg, rgb(198 244 50 / 0.9) 0 1px, transparent 1px 40px),
    repeating-linear-gradient(180deg, rgb(198 244 50 / 0.45) 0 1px, transparent 1px 8px) left / 4px 100% no-repeat;
}
</style>
