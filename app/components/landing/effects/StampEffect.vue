<script setup lang="ts">
// Each click leaves a rotated ink stamp with bleed texture that fades after a few seconds.
const props = defineProps<{ hero: HTMLElement }>()

const LIFETIME_MS = 3200
const MAX_STAMPS = 14
const LABELS = ['PAID ✓', 'EXTRACTED'] as const

interface Stamp {
  id: number
  x: number
  y: number
  rotate: number
  label: (typeof LABELS)[number]
}

const stamps = ref<Stamp[]>([])
let nextId = 0

useCursorEffectScope((scope) => {
  props.hero.style.cursor = 'crosshair'
  scope.onDispose(() => props.hero.style.removeProperty('cursor'))

  scope.listen<MouseEvent>(props.hero, 'click', (event) => {
    if ((event.target as Element | null)?.closest('a, button, input')) return
    const rect = props.hero.getBoundingClientRect()
    const id = nextId++
    stamps.value = [
      ...stamps.value.slice(-(MAX_STAMPS - 1)),
      {
        id,
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        rotate: Math.round(Math.random() * 30 - 15),
        label: LABELS[id % LABELS.length]!,
      },
    ]
    scope.timeout(() => {
      stamps.value = stamps.value.filter((stamp) => stamp.id !== id)
    }, LIFETIME_MS)
  })
})
</script>

<template>
  <div data-effect="stamp" class="absolute inset-0" aria-hidden="true">
    <svg class="absolute size-0">
      <filter id="stamp-bleed">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" result="bled" />
        <feComposite in="bled" in2="noise" operator="in" />
        <feGaussianBlur stdDeviation="0.35" />
      </filter>
    </svg>
    <div
      v-for="stamp in stamps"
      :key="stamp.id"
      class="stamp absolute left-0 top-0"
      :style="{ transform: `translate3d(${stamp.x}px, ${stamp.y}px, 0) translate(-50%, -50%) rotate(${stamp.rotate}deg)` }"
    >
      <div
        class="stamp-ink rounded-md border-[3px] px-4 py-1.5 text-2xl font-black tracking-[0.12em]"
        :class="stamp.label === 'PAID ✓' ? 'border-destructive text-destructive' : 'border-primary text-primary'"
      >
        {{ stamp.label }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.stamp-ink {
  filter: url(#stamp-bleed);
  mix-blend-mode: screen;
  animation: stamp-life 3200ms ease-out forwards;
}

@keyframes stamp-life {
  0% {
    opacity: 0;
    transform: scale(1.6);
  }
  8% {
    opacity: 0.95;
    transform: scale(0.96);
  }
  14% {
    transform: scale(1);
  }
  60% {
    opacity: 0.85;
  }
  100% {
    opacity: 0;
    transform: scale(1);
  }
}
</style>
