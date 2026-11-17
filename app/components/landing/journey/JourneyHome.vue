<script setup lang="ts">
import { ArrowRight, Check, FileJson, FileSpreadsheet, FileText, Plus, X } from '@lucide/vue'
import { useResizeObserver } from '@vueuse/core'
import { Button } from '@/components/ui/button'
import SampleInvoicePaper from '~/components/landing/SampleInvoicePaper.vue'
import LandingFooter from '~/components/landing/LandingFooter.vue'
import { faqs, headline, money, sampleFields, sampleInvoice as inv, steps } from '~/lib/landing/content'

/**
 * Version 1, Journey: one Invoice travels down the page. A pinned, scroll-scrubbed stage
 * shows it being added, extracted, checked, corrected and exported, chapter by chapter.
 */
const root = ref<HTMLElement>()
const stageBox = ref<HTMLElement>()
const scale = ref(1)
const STAGE_W = 560
const STAGE_H = 500
useResizeObserver(stageBox, ([entry]) => {
  if (entry) scale.value = Math.min(1, entry.contentRect.width / STAGE_W)
})

const chapters = [
  { id: 'add', title: 'Add', body: 'Drop in files or folders, or paste links. Each drop becomes a Batch you can follow, and every Document is checked against the size and page limits.' },
  { id: 'extract', title: 'Extract', body: 'Your model reads the Document and fills every Field in your Template: the vendor, the dates and each line item, highlighted where it was found.' },
  { id: 'check', title: 'Check', body: 'Plain-code Checks redo the math. The model read the total as 1,204.00, but subtotal plus tax says otherwise, so the Invoice is flagged.' },
  { id: 'review', title: 'Review', body: 'Fix the value with the Document beside you. The Raw Value is kept, the correction is marked, and the Checks run again right away.' },
  { id: 'export', title: 'Export', body: 'Export Reviewed Invoices as CSV, XLSX or nested JSON. Past exports wait in the downloads drawer.' },
]
const chapter = ref(0)
const reducedMode = ref(false)
let jumpTo: (i: number) => void = () => {}

const chips = [
  { label: 'northwind-0418.pdf', icon: FileText },
  { label: 'receipt-scan.jpg', icon: FileText },
  { label: 'q4-supplies.docx', icon: FileText },
  { label: 'https://billing…/inv', icon: FileText },
]
const chipFrom = [
  { x: -210, y: -170, r: -14 },
  { x: 200, y: -150, r: 10 },
  { x: -190, y: 160, r: 8 },
  { x: 190, y: 175, r: -9 },
]
const files = [
  { ext: 'CSV', icon: FileText, preview: ['invoice_number,vendor,total', 'INV-2026-0418,Northwind,1240.00'] },
  { ext: 'XLSX', icon: FileSpreadsheet, preview: ['Invoices · Line items', '2 sheets · 3 rows'] },
  { ext: 'JSON', icon: FileJson, preview: ['{ "total_amount": 1240,', '  "line_items": [ … ] }'] },
]

useLandingMotion(root, ({ gsap, SplitText, ScrollTrigger, reduced }) => {
  reducedMode.value = reduced
  const el = root.value!
  const cleanups: (() => void)[] = []

  // ── Hero ────────────────────────────────────────────────────────────────
  const title = SplitText.create('.j-title', { type: 'words', mask: 'words' })
  if (!reduced) {
    gsap.from(title.words, { yPercent: 110, duration: 1, ease: 'power4.out', stagger: 0.06 })
    gsap.from('.j-hero-fade', { y: 24, opacity: 0, duration: 0.9, ease: 'power3.out', stagger: 0.1, delay: 0.45 })
    gsap.from('.j-hero-paper', { y: 120, rotate: 10, opacity: 0, duration: 1.4, ease: 'expo.out', delay: 0.15 })
    gsap.from('.j-tag', { scale: 0, opacity: 0, duration: 0.6, ease: 'back.out(2.2)', stagger: 0.15, delay: 1 })
    gsap.to('.j-tag', { y: '+=12', duration: 2.6, ease: 'sine.inOut', repeat: -1, yoyo: true, stagger: 0.5 })

    const hl = gsap.timeline({ repeat: -1, repeatDelay: 0.8, delay: 1.3 })
    hl.to('.j-hero-paper .hl', { scaleX: 1, duration: 0.3, ease: 'power2.out', stagger: 0.12 })
      .to('.j-hero-paper .hl', { opacity: 0, duration: 0.6 }, '+=1.4')
      .set('.j-hero-paper .hl', { scaleX: 0, opacity: 1 })

    const tilt = el.querySelector<HTMLElement>('.j-hero-tilt')!
    const rx = gsap.quickTo(tilt, 'rotationX', { duration: 0.8, ease: 'power3.out' })
    const ry = gsap.quickTo(tilt, 'rotationY', { duration: 0.8, ease: 'power3.out' })
    cleanups.push(trackPointer(el.querySelector('.j-hero')!, (x, y) => { ry((x - 0.5) * 18); rx((0.5 - y) * 14) }))

    gsap.to('.j-hero-inner', {
      yPercent: -12, opacity: 0.2, ease: 'none',
      scrollTrigger: { trigger: '.j-hero', start: 'top top', end: 'bottom top', scrub: true },
    })
  }

  // ── Journey (pinned, scrubbed) ─────────────────────────────────────────
  if (!reduced) {
    // The static markup shows the reviewed end state; these set the starting state instead.
    gsap.set('.j-check-total .ok, .j-row-total .fix-wrap, .j-corrected', { opacity: 0 })
    gsap.set('.j-check-total .bad, .j-row-total .raw', { opacity: 1 })
    gsap.set('.j-row-total .fix', { clipPath: 'inset(0 100% 0 0)' })
    gsap.set('.j-row-bad, .j-flag', { opacity: 0 })
    gsap.set('.j-reviewed', { opacity: 0, scale: 2.4, rotate: -28 })
    gsap.set('.j-cursor', { x: 620, y: 560, opacity: 0 })

    const L = { add: 0, extract: 1.2, check: 2.6, review: 3.8, export: 5.6 }
    const tl = gsap.timeline({
      defaults: { ease: 'power2.inOut' },
      scrollTrigger: { trigger: '.j-journey', start: 'top 56px', end: '+=480%', pin: true, scrub: 0.9, anticipatePin: 1 },
      onUpdate() {
        const t = tl.time()
        chapter.value = Object.values(L).filter((v) => v <= t + 0.001).length - 1
      },
    })

    // Add
    tl.from('.j-drop', { opacity: 0, scale: 0.94, duration: 0.3 }, 0)
      .fromTo('.j-chip',
        { xPercent: -50, yPercent: -50, x: (i) => (chipFrom[i]?.x ?? 0), y: (i) => (chipFrom[i]?.y ?? 0), rotate: (i) => (chipFrom[i]?.r ?? 0), opacity: 1, scale: 1 },
        { x: 0, y: 0, rotate: 0, scale: 0.3, opacity: 0, duration: 0.55, ease: 'power3.in', stagger: 0.08 }, 0.1)
      .to('.j-drop', { borderColor: 'rgb(198 244 50 / 0.7)', backgroundColor: 'rgb(198 244 50 / 0.05)', duration: 0.15 }, 0.45)
      .from('.j-batch', { y: -12, opacity: 0, duration: 0.25 }, 0.55)
      .from('.j-paper-wrap', { y: -90, opacity: 0, rotate: -12, scale: 0.85, duration: 0.5, ease: 'back.out(1.5)' }, 0.65)
      .to('.j-drop, .j-batch', { opacity: 0, duration: 0.3 }, 1.0)

    // Extract
      .fromTo('.j-beam', { y: 0, opacity: 0 }, { opacity: 1, duration: 0.08 }, L.extract)
      .to('.j-beam', { y: 380, duration: 1.05, ease: 'none' }, L.extract + 0.05)
      .to('.j-beam', { opacity: 0, duration: 0.1 }, L.extract + 1.05)
      .to('.j-paper .hl', { scaleX: 1, duration: 0.14, stagger: 0.095 }, L.extract + 0.1)
      .from('.j-fields', { x: 70, opacity: 0, duration: 0.4 }, L.extract + 0.1)
      .from('.j-row', { x: -24, opacity: 0, duration: 0.22, stagger: 0.1 }, L.extract + 0.3)
      .to('.j-paper .hl', { opacity: 0.3, duration: 0.2 }, L.check - 0.15)

    // Check
      .from('.j-checks', { y: 50, opacity: 0, duration: 0.35 }, L.check)
      .from('.j-check', { x: -18, opacity: 0, duration: 0.2, stagger: 0.12 }, L.check + 0.15)
      .to('.j-row-bad, .j-flag', { opacity: 1, duration: 0.2 }, L.check + 0.65)
      .to('.j-row-total', { keyframes: { x: [0, -7, 7, -5, 5, -2, 0] }, duration: 0.45, ease: 'none' }, L.check + 0.65)
      .to('.j-paper [data-line="total_amount"] .hl', { opacity: 1, backgroundColor: 'rgb(255 92 92 / 0.45)', duration: 0.2 }, L.check + 0.65)

    // Review
      .to('.j-cursor', { opacity: 1, duration: 0.1 }, L.review)
      .to('.j-cursor', { x: 490, y: 318, duration: 0.5, ease: 'power2.out' }, L.review)
      .to('.j-cursor', { scale: 0.8, duration: 0.06, yoyo: true, repeat: 1 }, L.review + 0.5)
      .to('.j-row-total .raw', { opacity: 0, y: -10, duration: 0.2 }, L.review + 0.6)
      .to('.j-row-total .fix-wrap', { opacity: 1, duration: 0.01 }, L.review + 0.65)
      .to('.j-row-total .fix', { clipPath: 'inset(0 0% 0 0)', duration: 0.35, ease: 'steps(8)' }, L.review + 0.65)
      .to('.j-row-bad, .j-flag, .j-check-total .bad', { opacity: 0, duration: 0.15 }, L.review + 1.0)
      .to('.j-check-total .ok, .j-corrected', { opacity: 1, duration: 0.15 }, L.review + 1.0)
      .to('.j-paper [data-line="total_amount"] .hl', { backgroundColor: 'rgb(198 244 50 / 0.55)', duration: 0.2 }, L.review + 1.0)
      .to('.j-cursor', { x: 505, y: 92, duration: 0.35, ease: 'power2.inOut' }, L.review + 1.05)
      .to('.j-cursor', { scale: 0.8, duration: 0.06, yoyo: true, repeat: 1 }, L.review + 1.4)
      .to('.j-mark', { backgroundColor: '#c6f432', color: '#0b0d10', borderColor: '#c6f432', duration: 0.1 }, L.review + 1.45)
      .to('.j-reviewed', { opacity: 1, scale: 1, rotate: -9, duration: 0.25, ease: 'back.out(3)' }, L.review + 1.45)
      .to('.j-stage-inner', { keyframes: { y: [0, 4, -2, 0] }, duration: 0.2 }, L.review + 1.6)
      .to('.j-cursor', { opacity: 0, duration: 0.15 }, L.review + 1.65)

    // Export
      .to('.j-paper-wrap', { x: -90, opacity: 0, rotate: -10, duration: 0.5 }, L.export)
      .to('.j-checks', { y: 50, opacity: 0, duration: 0.4 }, L.export)
      .to('.j-fields, .j-reviewed', { x: -95, y: 40, scale: 0.55, opacity: 0, duration: 0.55 }, L.export + 0.1)
      .fromTo('.j-file',
        { xPercent: -50, yPercent: -50, x: 0, y: 0, rotate: 0, scale: 0.4, opacity: 0 },
        { x: byIndex([-175, 0, 175]), y: byIndex([24, -12, 24]), rotate: byIndex([-9, 0, 9]), scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(1.6)', stagger: 0.09 },
        L.export + 0.45)
      .from('.j-done', { y: 16, opacity: 0, duration: 0.3 }, L.export + 0.9)
      .to({}, { duration: 0.3 })

    tl.fromTo('.j-rail-fill', { scaleY: 0 }, { scaleY: 1, ease: 'none', duration: tl.duration() }, 0)

    jumpTo = (i: number) => {
      const st = tl.scrollTrigger!
      const t = Object.values(L)[i]! + 0.25
      window.scrollTo({ top: st.start + (st.end - st.start) * (t / tl.duration()), behavior: 'smooth' })
    }
  }

  // ── How it works: a path draws itself through the three steps ──────────
  if (!reduced) {
    gsap.from('.j-path', {
      drawSVG: '0%', ease: 'none',
      scrollTrigger: { trigger: '.j-how', start: 'top 70%', end: 'bottom 60%', scrub: 0.6 },
    })
    gsap.from('.j-step', {
      y: 40, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.15,
      scrollTrigger: { trigger: '.j-how', start: 'top 75%' },
    })
    gsap.from('.j-step-n', {
      scale: 0.2, opacity: 0, duration: 0.6, ease: 'back.out(2.5)', stagger: 0.35,
      scrollTrigger: { trigger: '.j-how', start: 'top 60%' },
    })
  }

  // ── FAQ rows, CTA ─────────────────────────────────────────────────────
  if (!reduced) {
    ScrollTrigger.batch('.j-faq-row', {
      start: 'top 88%',
      onEnter: (batch) => gsap.from(batch, { y: 30, opacity: 0, duration: 0.6, stagger: 0.08, ease: 'power3.out' }),
      once: true,
    })
    const cta = SplitText.create('.j-cta-title', { type: 'chars,words' })
    gsap.fromTo(cta.chars, { opacity: 0.12 }, {
      opacity: 1, stagger: 0.03, ease: 'none',
      scrollTrigger: { trigger: '.j-cta', start: 'top 80%', end: 'center 55%', scrub: true },
    })
    const btn = el.querySelector<HTMLElement>('.j-magnet')!
    const bx = gsap.quickTo(btn, 'x', { duration: 0.5, ease: 'power3.out' })
    const by = gsap.quickTo(btn, 'y', { duration: 0.5, ease: 'power3.out' })
    const area = el.querySelector<HTMLElement>('.j-cta')!
    const move = (e: PointerEvent) => {
      const r = btn.getBoundingClientRect()
      const dx = e.clientX - (r.left + r.width / 2)
      const dy = e.clientY - (r.top + r.height / 2)
      const near = Math.hypot(dx, dy) < 220
      bx(near ? dx * 0.3 : 0)
      by(near ? dy * 0.3 : 0)
    }
    area.addEventListener('pointermove', move)
    cleanups.push(() => area.removeEventListener('pointermove', move))
  }

  return () => cleanups.forEach((fn) => fn())
})
</script>

<template>
  <div ref="root" class="journey overflow-x-clip">
    <!-- HERO -->
    <section class="j-hero relative flex min-h-[calc(100svh-3.5rem)] items-center overflow-hidden">
      <div class="j-glow pointer-events-none absolute inset-0" aria-hidden="true" />
      <div class="j-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div class="j-hero-inner relative mx-auto grid w-full max-w-6xl items-center gap-14 px-4 py-16 sm:px-6 lg:grid-cols-[1.15fr_1fr]">
        <div class="flex flex-col gap-6">
          <p class="j-hero-fade num inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
            <span class="size-1.5 animate-pulse rounded-full bg-primary" /> Self-hosted · bring your own LLM
          </p>
          <h1 class="j-title text-4xl font-semibold tracking-tight text-balance sm:text-6xl">{{ headline.title }}</h1>
          <p class="j-hero-fade max-w-xl text-lg text-muted-foreground">{{ headline.lead }}</p>
          <div class="j-hero-fade flex flex-wrap gap-3">
            <Button as-child size="lg"><NuxtLink to="/auth/sign-up">Get started <ArrowRight /></NuxtLink></Button>
            <Button as-child size="lg" variant="outline"><a href="#journey">See it work</a></Button>
          </div>
        </div>

        <div class="relative mx-auto w-full max-w-[340px] [perspective:1000px]">
          <div class="j-hero-tilt relative [transform-style:preserve-3d]">
            <div class="j-hero-paper aspect-[3/4]"><SampleInvoicePaper /></div>
            <span class="j-tag num absolute -left-3 top-[12%] sm:-left-10 rounded-md border border-primary/40 bg-card px-2 py-1 text-xs shadow-xl [transform:translateZ(60px)]">
              <span class="text-muted-foreground">vendor_name</span> <Check class="inline size-3 text-primary" />
            </span>
            <span class="j-tag num absolute -right-3 top-[46%] sm:-right-8 rounded-md border border-primary/40 bg-card px-2 py-1 text-xs shadow-xl [transform:translateZ(80px)]">
              <span class="text-muted-foreground">line_items</span> [2]
            </span>
            <span class="j-tag num absolute -left-3 bottom-[8%] sm:-left-6 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground shadow-xl [transform:translateZ(100px)]">
              total_amount: 1,240.00
            </span>
          </div>
        </div>
      </div>
      <div class="absolute inset-x-0 bottom-6 flex justify-center">
        <a href="#journey" class="num flex flex-col items-center gap-2 text-[10px] tracking-[0.3em] text-muted-foreground">
          SCROLL<span class="j-scroll-line h-10 w-px bg-gradient-to-b from-primary to-transparent" />
        </a>
      </div>
    </section>

    <!-- JOURNEY -->
    <section id="journey" class="j-journey relative scroll-mt-14 border-t border-border/60" :class="reducedMode ? 'py-20' : 'h-[calc(100svh-3.5rem)]'">
      <div class="mx-auto grid h-full w-full max-w-6xl items-center gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
        <div class="flex flex-col gap-4 lg:gap-8">
          <p class="num hidden text-xs tracking-[0.25em] text-primary lg:block">ONE INVOICE, START TO FINISH</p>
          <!-- chapter rail -->
          <div class="flex gap-4 lg:gap-6">
            <div class="relative hidden w-px bg-border lg:block" aria-hidden="true">
              <div class="j-rail-fill absolute inset-0 origin-top bg-primary" />
            </div>
            <ol class="flex w-full justify-between gap-1 lg:flex-col lg:gap-3">
              <li v-for="(c, i) in chapters" :key="c.id">
                <button
                  type="button"
                  class="flex items-baseline gap-2 text-left transition-colors duration-300"
                  :class="reducedMode || chapter === i ? 'text-foreground' : 'text-muted-foreground/50 hover:text-muted-foreground'"
                  @click="jumpTo(i)"
                >
                  <span class="num text-[10px] text-primary">0{{ i + 1 }}</span>
                  <span class="text-sm font-semibold sm:text-base lg:text-2xl">{{ c.title }}</span>
                </button>
              </li>
            </ol>
          </div>
          <div v-if="!reducedMode" class="grid min-h-[5.5rem] lg:min-h-[7rem]">
            <p
              v-for="(c, i) in chapters"
              :key="c.id"
              class="[grid-area:1/1] max-w-md text-sm text-muted-foreground transition-all duration-500 sm:text-base lg:text-lg"
              :class="chapter === i ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'"
              :aria-hidden="chapter !== i"
            >
              {{ c.body }}
            </p>
          </div>
          <dl v-else class="grid gap-3">
            <div v-for="c in chapters" :key="c.id"><dt class="font-semibold">{{ c.title }}</dt><dd class="text-muted-foreground">{{ c.body }}</dd></div>
          </dl>
        </div>

        <!-- stage -->
        <div ref="stageBox" class="relative w-full" :style="{ height: `${STAGE_H * scale}px` }">
          <div
            class="absolute left-1/2 top-0 origin-top"
            :style="{ width: `${STAGE_W}px`, height: `${STAGE_H}px`, transform: `translateX(-50%) scale(${scale})` }"
          >
            <div class="j-stage-inner relative size-full">
              <div class="j-drop absolute inset-0 rounded-3xl border-2 border-dashed border-white/15" :class="reducedMode && 'hidden'">
                <p class="absolute inset-x-0 bottom-6 text-center text-sm text-muted-foreground">Drop files, folders or URLs</p>
              </div>
              <div class="j-batch num absolute inset-x-0 top-5 mx-auto w-fit rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs text-primary" :class="reducedMode && 'hidden'">
                Batch · 4 Documents · queued
              </div>
              <div
                v-for="c in chips"
                :key="c.label"
                class="j-chip num absolute left-1/2 top-1/2 flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card px-3 py-2 text-xs opacity-0 shadow-xl"
              >
                <component :is="c.icon" class="size-3.5 text-primary" /> {{ c.label }}
              </div>

              <div class="j-paper-wrap absolute left-[18px] top-[48px] h-[380px] w-[270px]">
                <div class="j-paper relative size-full -rotate-2">
                  <SampleInvoicePaper />
                  <div class="j-beam pointer-events-none absolute inset-x-[-6px] top-0 h-[3px] rounded-full bg-primary opacity-0 shadow-[0_0_24px_6px_rgb(198_244_50/0.6)]" />
                </div>
              </div>

              <div class="j-fields absolute left-[255px] top-[70px] w-[290px] overflow-hidden rounded-xl border border-border bg-card/95 shadow-2xl backdrop-blur">
                <div class="flex h-10 items-center justify-between border-b border-border px-3">
                  <span class="num whitespace-nowrap text-xs text-muted-foreground">{{ inv.number }}</span>
                  <span class="flex items-center gap-1.5">
                    <span class="j-flag num whitespace-nowrap rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] text-destructive opacity-0">1 failed</span>
                    <span class="j-mark whitespace-nowrap rounded-md border border-border px-2 py-0.5 text-[10px]">Mark reviewed</span>
                  </span>
                </div>
                <div
                  v-for="f in sampleFields"
                  :key="f.key"
                  class="j-row relative flex h-7 items-center justify-between px-3 text-xs"
                  :class="f.key === 'total_amount' && 'j-row-total'"
                >
                  <span v-if="f.key === 'total_amount'" class="j-row-bad absolute inset-0 bg-destructive/15 opacity-0" aria-hidden="true" />
                  <span class="num relative text-muted-foreground">{{ f.key }}</span>
                  <span v-if="f.key !== 'total_amount'" class="num relative">{{ f.value }}</span>
                  <span v-else class="relative grid justify-items-end">
                    <span class="raw num [grid-area:1/1] text-destructive opacity-0">{{ money(inv.rawTotal) }}</span>
                    <span class="fix-wrap [grid-area:1/1] flex items-center gap-1.5">
                      <span class="j-corrected rounded bg-primary/15 px-1 text-[9px] text-primary">edited</span>
                      <span class="fix num font-semibold text-primary">{{ money(inv.correctedTotal) }}</span>
                    </span>
                  </span>
                </div>
              </div>

              <div class="j-reviewed num absolute left-[400px] top-[30px] -rotate-[9deg] rounded-md border-2 border-primary px-2 py-0.5 text-sm font-bold tracking-widest text-primary">
                REVIEWED
              </div>

              <div class="j-checks absolute left-[235px] top-[350px] w-[310px] rounded-xl border border-border bg-card/95 p-3 shadow-2xl">
                <p class="num mb-2 text-[10px] tracking-widest text-muted-foreground">CHECKS</p>
                <div class="j-check flex items-center gap-2 py-0.5 text-xs"><Check class="size-3.5 text-primary" /> Line items add up to subtotal</div>
                <div class="j-check j-check-total flex items-center gap-2 py-0.5 text-xs">
                  <span class="grid size-3.5"><X class="bad [grid-area:1/1] size-3.5 text-destructive opacity-0" /><Check class="ok [grid-area:1/1] size-3.5 text-primary" /></span>
                  Subtotal + tax = total
                </div>
                <div class="j-check flex items-center gap-2 py-0.5 text-xs"><Check class="size-3.5 text-primary" /> Due date after issue date</div>
                <div class="j-check flex items-center gap-2 py-0.5 text-xs"><Check class="size-3.5 text-primary" /> Currency EUR is valid</div>
              </div>

              <div
                v-for="f in files"
                :key="f.ext"
                class="j-file absolute left-1/2 top-[46%] flex h-[160px] w-[130px] flex-col gap-2 rounded-xl border border-border bg-card p-3 opacity-0 shadow-2xl"
              >
                <component :is="f.icon" class="size-6 text-primary" />
                <p class="num text-lg font-semibold">.{{ f.ext.toLowerCase() }}</p>
                <p v-for="line in f.preview" :key="line" class="num truncate text-[9px] text-muted-foreground">{{ line }}</p>
              </div>
              <p class="j-done num absolute inset-x-0 bottom-6 text-center text-xs text-muted-foreground" :class="reducedMode && 'hidden'">
                1 Invoice · Reviewed · 3 files ready
              </p>

              <svg class="j-cursor pointer-events-none absolute left-0 top-0 size-6 opacity-0 drop-shadow-lg" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 2l7.5 19 2.6-7.6L21 10.8z" fill="#fff" stroke="#0b0d10" stroke-width="1.5" stroke-linejoin="round" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- HOW IT WORKS -->
    <section id="how" class="j-how relative scroll-mt-14 border-t border-border/60 py-24 sm:py-32">
      <div class="mx-auto max-w-6xl px-4 sm:px-6">
        <p class="num text-xs tracking-[0.25em] text-primary">HOW IT WORKS</p>
        <h2 class="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">Three steps. No retyping.</h2>
        <div class="relative mt-16">
          <svg class="pointer-events-none absolute inset-x-0 top-0 hidden h-[120px] w-full sm:block" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
            <path d="M 200 60 C 360 -20, 440 140, 600 60 S 840 -20, 1000 60" fill="none" stroke="var(--border)" stroke-width="2" stroke-dasharray="4 8" />
            <path class="j-path" d="M 200 60 C 360 -20, 440 140, 600 60 S 840 -20, 1000 60" fill="none" stroke="var(--primary)" stroke-width="2.5" />
          </svg>
          <ol class="relative grid gap-12 sm:grid-cols-3 sm:gap-6">
            <li v-for="s in steps" :key="s.n" class="j-step flex flex-col items-start gap-4 sm:items-center sm:text-center">
              <span class="j-step-n num grid size-[72px] place-items-center rounded-full border-2 border-primary bg-background text-xl font-semibold text-primary shadow-[0_0_40px_rgb(198_244_50/0.25)] sm:mt-6">
                {{ s.n }}
              </span>
              <h3 class="text-xl font-semibold">{{ s.title }}</h3>
              <p class="max-w-xs text-muted-foreground">{{ s.body }}</p>
            </li>
          </ol>
        </div>
      </div>
    </section>

    <!-- FAQ -->
    <section id="faq" class="scroll-mt-14 border-t border-border/60 py-24 sm:py-32">
      <div class="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p class="num text-xs tracking-[0.25em] text-primary">FAQ</p>
          <h2 class="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Questions, answered.</h2>
        </div>
        <div class="j-faq">
          <details v-for="(f, i) in faqs" :key="f.q" class="j-faq-row group border-b border-border py-5" :name="'j-faq'" :open="i === 0">
            <summary class="flex cursor-pointer list-none items-center justify-between gap-6 text-lg font-medium [&::-webkit-details-marker]:hidden">
              <span class="flex gap-4"><span class="num pt-1 text-xs text-primary">0{{ i + 1 }}</span>{{ f.q }}</span>
              <Plus class="size-5 shrink-0 text-muted-foreground transition-transform duration-300 group-open:rotate-45 group-open:text-primary" />
            </summary>
            <p class="pl-9 pt-3 text-muted-foreground">{{ f.a }}</p>
          </details>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="j-cta relative overflow-hidden border-t border-border/60 py-32 sm:py-44">
      <div class="j-cta-glow pointer-events-none absolute inset-0" aria-hidden="true" />
      <div class="relative mx-auto flex max-w-5xl flex-col items-center gap-10 px-4 text-center sm:px-6">
        <h2 class="j-cta-title text-4xl font-semibold tracking-tight text-balance sm:text-7xl">Stop retyping invoices. Start reviewing them.</h2>
        <Button as-child size="lg" class="j-magnet h-14 rounded-full px-10 text-base">
          <NuxtLink to="/auth/sign-up">Get started <ArrowRight /></NuxtLink>
        </Button>
      </div>
    </section>

    <LandingFooter />
  </div>
</template>

<style scoped>
.j-glow {
  background: radial-gradient(600px circle at var(--mx, 70%) var(--my, 40%), rgb(198 244 50 / 0.12), transparent 60%);
}
.j-grid {
  background-image:
    linear-gradient(to right, rgb(255 255 255 / 0.04) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(255 255 255 / 0.04) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(ellipse at 60% 40%, black 20%, transparent 70%);
}
.j-scroll-line {
  animation: j-drip 2s ease-in-out infinite;
  transform-origin: top;
}
@keyframes j-drip {
  0% { transform: scaleY(0); }
  50% { transform: scaleY(1); }
  100% { transform: scaleY(1); opacity: 0; }
}
.j-faq {
  interpolate-size: allow-keywords;
}
.j-faq details::details-content {
  block-size: 0;
  overflow: hidden;
  transition: block-size 0.4s ease, content-visibility 0.4s allow-discrete;
}
.j-faq details[open]::details-content {
  block-size: auto;
}
.j-cta-glow {
  background: radial-gradient(50% 60% at 50% 100%, rgb(198 244 50 / 0.16), transparent 70%);
}
@media (prefers-reduced-motion: reduce) {
  .j-scroll-line { animation: none; }
}
</style>
