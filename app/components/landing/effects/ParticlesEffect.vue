<script setup lang="ts">
import { trackPointer } from '~/lib/cursor-effects/pointer'
import { tableGridSlot, type TableGrid } from '~/lib/cursor-effects/table-grid'

// Digits, braces and currency signs drift on a canvas and snap into a table grid near the cursor.
const props = defineProps<{ hero: HTMLElement }>()

const GLYPHS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '{', '}', '€', '$']
const COUNT = 140
const PULL_RADIUS = 200
const GRID: TableGrid = { columns: 8, rows: 5, cellWidth: 26, cellHeight: 22 }

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  glyph: string
  snapped: number
}

const canvas = ref<HTMLCanvasElement>()

useCursorEffectScope((scope) => {
  const el = canvas.value!
  const ctx = el.getContext('2d')!
  const pointer = trackPointer(scope, props.hero)
  const style = getComputedStyle(document.documentElement)
  const accent = style.getPropertyValue('--ledger-accent').trim() || '#c6f432'
  const muted = style.getPropertyValue('--ledger-text-muted').trim() || '#9a9890'
  let width = 0
  let height = 0
  let particles: Particle[] = []

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    width = props.hero.clientWidth
    height = props.hero.clientHeight
    el.width = Math.round(width * ratio)
    el.height = Math.round(height * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.font = '13px "JetBrains Mono Variable", ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (!particles.length) {
      particles = Array.from({ length: COUNT }, (_, i) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        glyph: GLYPHS[i % GLYPHS.length]!,
        snapped: 0,
      }))
    }
  }
  resize()
  const observer = new ResizeObserver(resize)
  observer.observe(props.hero)
  scope.onDispose(() => observer.disconnect())

  scope.loop(() => {
    const p = pointer.sample()
    ctx.clearRect(0, 0, width, height)
    let slot = 0
    for (const particle of particles) {
      const near = p.inside && Math.hypot(particle.x - p.x, particle.y - p.y) < PULL_RADIUS
      const target = near ? tableGridSlot(slot++, p, GRID) : null
      if (target) {
        particle.x += (target.x - particle.x) * 0.16
        particle.y += (target.y - particle.y) * 0.16
        particle.snapped = Math.min(1, particle.snapped + 0.08)
      } else {
        particle.x += particle.vx
        particle.y += particle.vy
        if (particle.x < -10) particle.x = width + 10
        else if (particle.x > width + 10) particle.x = -10
        if (particle.y < -10) particle.y = height + 10
        else if (particle.y > height + 10) particle.y = -10
        particle.snapped = Math.max(0, particle.snapped - 0.04)
      }
      ctx.globalAlpha = 0.35 + particle.snapped * 0.65
      ctx.fillStyle = particle.snapped > 0.5 ? accent : muted
      ctx.fillText(particle.glyph, particle.x, particle.y)
    }
    ctx.globalAlpha = 1
  })
})
</script>

<template>
  <canvas ref="canvas" data-effect="particles" class="absolute inset-0 size-full" aria-hidden="true" />
</template>
