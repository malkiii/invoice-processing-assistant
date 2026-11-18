<script setup lang="ts">
import '@fontsource-variable/fraunces'
import '@fontsource-variable/caveat'
import { ArrowRight, Plus } from '@lucide/vue'
import LandingFooter from '~/components/landing/LandingFooter.vue'
import SampleInvoicePaper from '~/components/landing/SampleInvoicePaper.vue'
import { faqs, features, headline, money, providers, sampleInvoice as inv, steps } from '~/lib/landing/content'

/**
 * Version 4, Paper & ink: a tactile desk. Invoices shuffle onto the page, a highlighter
 * marks the Fields, a red pen circles the wrong total, a stamp lands on the correction,
 * and the sheet files itself into a ledger. The features scroll sideways like a binder.
 */
const root = ref<HTMLElement>()
const reducedMode = ref(false)
const [titleStart, titleMark] = headline.title.split(/(?<=into )/)
const f = Object.fromEntries(features.map((x) => [x.id, x]))

const sheets = [
  { id: 'gather', n: 'i.', title: f.intake!.title, body: f.intake!.body },
  { id: 'mark', n: 'ii.', title: f.templates!.title, body: `${f.templates!.body} ${f.extract!.body}` },
  { id: 'check', n: 'iii.', title: f.checks!.title, body: f.checks!.body },
  { id: 'correct', n: 'iv.', title: f.review!.title, body: f.review!.body },
  { id: 'file', n: 'v.', title: f.export!.title, body: f.export!.body },
]
const dropped = [
  { label: 'PDF', name: 'northwind-0418', r: -8 },
  { label: 'JPG', name: 'taxi-receipt', r: 6 },
  { label: 'DOCX', name: 'q4-supplies', r: -3 },
  { label: 'URL', name: 'billing.example/inv', r: 9 },
]
const notes = [
  { text: 'vendor_name', top: '9%' },
  { text: 'invoice_date', top: '22%' },
  { text: 'line_items ×2', top: '48%' },
  { text: 'total_amount', top: '80%' },
]
const stampInks = ['#2446c8', '#c4352b', '#1f7a4d']
const stampTilt = [-7, 5, -3, 8, -10, 4, -5]

useLandingMotion(root, ({ gsap, ScrollTrigger, reduced }) => {
  reducedMode.value = reduced
  const el = root.value!
  if (reduced) return

  const cleanups: (() => void)[] = []

  // ── Hero: papers shuffle onto the desk, the highlighter swipes the title ──
  gsap.from('.p-title-line', { y: 40, opacity: 0, duration: 1, ease: 'power3.out', stagger: 0.12 })
  gsap.to('.p-mark', { backgroundSize: '100% 52%', duration: 1.1, ease: 'power2.inOut', delay: 0.9 })
  gsap.from('.p-hero-fade', { y: 16, opacity: 0, duration: 0.8, stagger: 0.1, delay: 0.6 })
  gsap.from('.p-sheet', {
    x: byIndex([-260, 300, 120]), y: byIndex([-320, -260, 380]), rotation: byIndex([-40, 35, 20]), opacity: 0,
    duration: 1.3, ease: 'expo.out', stagger: 0.14, delay: 0.2,
  })
  gsap.from('.p-sticky', { scale: 0, rotation: -40, duration: 0.7, ease: 'back.out(2.5)', delay: 1.3 })
  gsap.from('.p-clip', { y: -60, opacity: 0, duration: 0.6, ease: 'bounce.out', delay: 1.1 })
  const desk = el.querySelector<HTMLElement>('.p-desk')!
  const sheetsEls = gsap.utils.toArray<HTMLElement>('.p-sheet-parallax')
  const movers = sheetsEls.map((s) => ({ x: gsap.quickTo(s, 'x', { duration: 0.9, ease: 'power3.out' }), y: gsap.quickTo(s, 'y', { duration: 0.9, ease: 'power3.out' }) }))
  cleanups.push(trackPointer(el.querySelector('.p-hero')!, (x, y) => {
    movers.forEach((m, i) => { const d = (i + 1) * 10; m.x((x - 0.5) * d); m.y((y - 0.5) * d) })
  }))
  const fan = () => gsap.to('.p-sheet-fan', { rotation: byIndex([-14, 12, 0]), x: byIndex([-50, 50, 0]), duration: 0.6, ease: 'back.out(2)' })
  const unfan = () => gsap.to('.p-sheet-fan', { rotation: 0, x: 0, duration: 0.6, ease: 'power3.out' })
  desk.addEventListener('pointerenter', fan)
  desk.addEventListener('pointerleave', unfan)
  cleanups.push(() => { desk.removeEventListener('pointerenter', fan); desk.removeEventListener('pointerleave', unfan) })

  // ── Features: a binder of sheets scrolled sideways ──────────────────────
  const track = el.querySelector<HTMLElement>('.p-track')!
  const distance = () => track.scrollWidth - document.documentElement.clientWidth
  const binder = gsap.to(track, {
    x: () => -distance(),
    ease: 'none',
    scrollTrigger: { trigger: '.p-binder', start: 'top 56px', end: () => `+=${distance()}`, pin: true, scrub: 1, invalidateOnRefresh: true, anticipatePin: 1 },
  })
  gsap.fromTo('.p-binder-progress', { scaleX: 0 }, {
    scaleX: 1, ease: 'none',
    scrollTrigger: { trigger: '.p-binder', start: 'top 56px', end: () => `+=${distance()}`, scrub: true, invalidateOnRefresh: true },
  })
  const onSheet = (id: string, build: (tl: gsap.core.Timeline) => void) => {
    const tl = gsap.timeline({
      scrollTrigger: { trigger: `.p-panel-${id}`, containerAnimation: binder, start: 'left 55%', toggleActions: 'play none none reverse' },
    })
    build(tl)
  }
  onSheet('gather', (tl) => tl
    .from('.p-drop', { y: -320, rotation: (i) => (dropped[i]?.r ?? 0) * 4, opacity: 0, duration: 0.8, ease: 'bounce.out', stagger: 0.15 })
    .from('.p-soon', { scale: 0, rotation: 30, duration: 0.5, ease: 'back.out(3)' }, '-=0.2'))
  onSheet('mark', (tl) => tl
    .to('.p-panel-mark .hl', { scaleX: 1, duration: 0.3, ease: 'power2.out', stagger: 0.12 })
    .from('.p-note', { x: -20, opacity: 0, duration: 0.4, stagger: 0.18 }, 0.4)
    .from('.p-note-line', { scaleX: 0, duration: 0.3, stagger: 0.18 }, 0.4))
  onSheet('check', (tl) => tl
    .fromTo('.p-write', { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.5, ease: 'power1.inOut', stagger: 0.35 })
    .from('.p-circle', { drawSVG: '0%', duration: 0.7, ease: 'power2.inOut' })
    .from('.p-cross', { drawSVG: '0%', duration: 0.25, stagger: 0.15 }))
  onSheet('correct', (tl) => tl
    .from('.p-strike', { scaleX: 0, duration: 0.35, ease: 'power2.in' }, 0.2)
    .fromTo('.p-fix', { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.6, ease: 'power1.inOut' })
    .from('.p-kept', { opacity: 0, y: 8, duration: 0.3 })
    .from('.p-big-stamp', { scale: 3, opacity: 0, rotation: -40, duration: 0.3, ease: 'power4.in' }, '+=0.2')
    .to('.p-correct-card', { keyframes: { y: [0, 6, -3, 0], rotation: [0, 0.6, -0.4, 0] }, duration: 0.3 }))
  onSheet('file', (tl) => tl
    .from('.p-ledger-row', { x: -60, opacity: 0, duration: 0.4, ease: 'power3.out', stagger: 0.12 })
    .from('.p-tab', { y: 40, opacity: 0, duration: 0.5, ease: 'back.out(2.5)', stagger: 0.12 }, '-=0.2'))

  // ── How it works: index cards pinned to the board ─────────────────────
  gsap.from('.p-card', {
    y: -160, rotation: byIndex([-25, 18, -12]), opacity: 0, duration: 1.1, ease: 'bounce.out', stagger: 0.2,
    scrollTrigger: { trigger: '.p-board', start: 'top 70%' },
  })
  gsap.from('.p-pin', {
    scale: 0, duration: 0.3, ease: 'back.out(4)', stagger: 0.2, delay: 0.8,
    scrollTrigger: { trigger: '.p-board', start: 'top 70%' },
  })

  // ── Providers: one stamp at a time ─────────────────────────────────────
  const stamps = gsap.timeline({ scrollTrigger: { trigger: '.p-stamp-page', start: 'top 70%' } })
  gsap.utils.toArray<HTMLElement>('.p-stamp').forEach((s) => {
    stamps.from(s, { scale: 2.6, opacity: 0, duration: 0.22, ease: 'power4.in' })
      .to('.p-stamp-page', { keyframes: { y: [0, 3, -1, 0] }, duration: 0.14 })
  })

  ScrollTrigger.batch('.p-faq', {
    start: 'top 92%', once: true,
    onEnter: (batch) => gsap.from(batch, { opacity: 0, x: -16, duration: 0.5, stagger: 0.08 }),
  })

  // ── CTA: the receipt prints ────────────────────────────────────────────
  gsap.fromTo('.p-receipt', { clipPath: 'inset(0 0 100% 0)' }, {
    clipPath: 'inset(0 0 0% 0)', duration: 2.2, ease: 'steps(22)',
    scrollTrigger: { trigger: '.p-cta', start: 'top 65%' },
  })

  return () => cleanups.forEach((fn) => fn())
})
</script>

<template>
  <div ref="root" data-theme="day" class="paper overflow-x-clip bg-background text-foreground">
    <!-- HERO -->
    <section class="p-hero relative flex min-h-[calc(100svh-3.5rem)] items-center overflow-hidden">
      <div class="mx-auto grid w-full max-w-6xl items-center gap-16 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr]">
        <div class="flex flex-col gap-7">
          <p class="p-hero-fade p-hand text-2xl text-[var(--pen)]">no more retyping, promise.</p>
          <h1 class="p-serif text-5xl leading-[1.02] tracking-tight sm:text-7xl">
            <span class="p-title-line block">{{ titleStart }}</span>
            <span class="p-title-line block"><span class="p-mark">{{ titleMark }}</span></span>
          </h1>
          <p class="p-hero-fade max-w-xl text-lg leading-relaxed text-muted-foreground">{{ headline.lead }}</p>
          <div class="p-hero-fade flex flex-wrap items-center gap-5">
            <NuxtLink to="/auth/sign-up" class="p-btn inline-flex items-center gap-2 rounded-full bg-foreground px-7 py-3.5 text-background">
              Get started <ArrowRight class="size-4" />
            </NuxtLink>
            <a href="#binder" class="p-hand text-2xl underline decoration-[var(--pen)] decoration-wavy underline-offset-8">see how ↓</a>
          </div>
        </div>

        <div class="p-desk relative mx-auto aspect-[3/4] w-full max-w-[330px]">
          <div class="p-sheet-parallax absolute inset-0"><div class="p-sheet size-full"><div class="p-sheet-fan size-full rotate-[-7deg] rounded-[3px] bg-[#fdfbf6] shadow-xl" /></div></div>
          <div class="p-sheet-parallax absolute inset-0"><div class="p-sheet size-full"><div class="p-sheet-fan size-full rotate-[5deg] rounded-[3px] bg-[#f7f2e7] shadow-xl" /></div></div>
          <div class="p-sheet-parallax absolute inset-0"><div class="p-sheet size-full"><div class="p-sheet-fan size-full rotate-[-1deg]"><SampleInvoicePaper /></div></div></div>
          <svg class="p-clip absolute -top-6 left-10 h-16 w-8" viewBox="0 0 32 64" aria-hidden="true">
            <path d="M10 60 V12 a6 6 0 0 1 12 0 V52 a4 4 0 0 1 -8 0 V18" fill="none" stroke="#8a8f98" stroke-width="3" stroke-linecap="round" />
          </svg>
          <div class="p-sticky p-hand absolute -bottom-6 -right-4 w-36 rotate-[6deg] bg-[#fff27a] p-3 text-xl leading-tight shadow-lg sm:-right-10">
            14 fields,<br>0 typing ✓
          </div>
        </div>
      </div>
    </section>

    <!-- BINDER (horizontal features) -->
    <section id="binder" class="p-binder relative" :class="reducedMode ? '' : 'h-[calc(100svh-3.5rem)] overflow-hidden'">
      <div v-if="!reducedMode" class="absolute inset-x-0 top-0 z-10 h-1 bg-black/5"><div class="p-binder-progress h-full origin-left bg-[var(--pen)]" /></div>
      <div class="p-track flex h-full" :class="reducedMode ? 'flex-col' : 'w-max'">
        <article
          v-for="s in sheets"
          :key="s.id"
          :class="[`p-panel-${s.id}`, reducedMode ? 'py-16' : 'h-full w-screen']"
          class="flex items-center justify-center px-4 sm:px-8"
        >
          <div class="p-ruled grid w-full max-w-5xl items-center gap-6 rounded-sm bg-card px-6 py-8 shadow-[0_20px_60px_-25px_rgb(0_0_0/0.35)] sm:px-12 sm:py-12 md:grid-cols-2 md:gap-12">
            <div>
              <p class="p-hand text-3xl text-[var(--pen)]">{{ s.n }}</p>
              <h2 class="p-serif mt-1 text-3xl tracking-tight sm:text-5xl">{{ s.title }}</h2>
              <p class="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">{{ s.body }}</p>
            </div>

            <div class="relative mx-auto h-[260px] w-full max-w-[380px] sm:h-[340px]">
              <!-- i. gather -->
              <template v-if="s.id === 'gather'">
                <div class="absolute inset-x-6 bottom-0 h-20 rounded-b-lg border-2 border-t-0 border-[#8b6b3e] bg-[#c9a36b]/30" />
                <div
                  v-for="(d, i) in dropped"
                  :key="d.label"
                  class="p-drop absolute bottom-6 flex h-28 w-20 flex-col justify-between rounded-[2px] bg-white p-2 shadow-md sm:h-32 sm:w-24"
                  :style="{ left: `${12 + i * 19}%`, rotate: `${d.r}deg`, zIndex: i }"
                >
                  <span class="num text-[10px] font-bold text-[var(--pen)]">{{ d.label }}</span>
                  <span class="space-y-1"><span v-for="n in 4" :key="n" class="block h-px bg-black/15" /></span>
                  <span class="truncate text-[8px] text-muted-foreground">{{ d.name }}</span>
                </div>
                <div class="p-soon p-hand absolute right-0 top-2 rotate-[8deg] bg-[#fff27a] px-3 py-2 text-lg shadow">Drive &amp; Dropbox: soon!</div>
              </template>

              <!-- ii. mark -->
              <template v-else-if="s.id === 'mark'">
                <div class="absolute left-0 top-0 h-full w-[60%]"><SampleInvoicePaper /></div>
                <div v-for="n in notes" :key="n.text" class="absolute left-[60%] flex items-center" :style="{ top: n.top }">
                  <span class="p-note-line h-px w-5 origin-left bg-[var(--pen)]" />
                  <span class="p-note p-hand whitespace-nowrap pl-1 text-lg text-[var(--pen)] sm:text-xl">{{ n.text }}</span>
                </div>
              </template>

              <!-- iii. check -->
              <template v-else-if="s.id === 'check'">
                <div class="p-hand absolute inset-0 flex flex-col justify-center gap-1 text-2xl sm:text-3xl">
                  <p class="p-write">&nbsp;&nbsp;{{ money(inv.lineItems[0]!.amount) }}</p>
                  <p class="p-write">+ {{ money(inv.lineItems[1]!.amount) }}</p>
                  <p class="p-write border-t-2 border-foreground/70 pt-1">= {{ money(inv.subtotal) }} <span class="text-[#1f7a4d]">✓</span></p>
                  <p class="p-write mt-3">{{ money(inv.subtotal) }} + {{ money(inv.tax) }} = {{ money(inv.correctedTotal) }}</p>
                  <p class="p-write relative mt-3 w-fit">model said: <span class="relative">{{ money(inv.rawTotal) }}
                    <svg class="pointer-events-none absolute -inset-x-4 -inset-y-3 h-[calc(100%+1.5rem)] w-[calc(100%+2rem)] overflow-visible" viewBox="0 0 160 60" preserveAspectRatio="none" aria-hidden="true">
                      <path class="p-circle" d="M12 34 C8 8 150 2 156 26 C162 52 24 60 8 36 C2 22 40 6 92 6" fill="none" stroke="var(--pen)" stroke-width="3" stroke-linecap="round" />
                    </svg>
                  </span></p>
                </div>
                <svg class="absolute right-2 top-4 size-16" viewBox="0 0 60 60" aria-hidden="true">
                  <path class="p-cross" d="M8 8 L52 50" stroke="var(--pen)" stroke-width="5" stroke-linecap="round" />
                  <path class="p-cross" d="M50 8 L10 52" stroke="var(--pen)" stroke-width="5" stroke-linecap="round" />
                </svg>
              </template>

              <!-- iv. correct -->
              <template v-else-if="s.id === 'correct'">
                <div class="p-correct-card absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-sm border border-black/10 bg-white p-6 shadow-lg">
                  <p class="num text-xs text-muted-foreground">total_amount</p>
                  <div class="mt-2 flex flex-wrap items-baseline gap-4">
                    <span class="num relative text-3xl text-muted-foreground">
                      {{ money(inv.rawTotal) }}
                      <span class="p-strike absolute inset-x-[-4px] top-1/2 h-[3px] origin-left -rotate-3 rounded bg-[var(--pen)]" />
                    </span>
                    <span class="p-fix p-hand text-5xl text-[#2446c8]">{{ money(inv.correctedTotal) }}</span>
                  </div>
                  <p class="p-kept mt-3 text-xs text-muted-foreground">raw value kept · revert any time</p>
                  <div class="p-big-stamp p-ink pointer-events-none absolute -right-2 -top-8 rotate-[-12deg] rounded-md border-4 border-[#1f7a4d] px-4 py-1 text-2xl font-black tracking-[0.2em] text-[#1f7a4d] sm:-right-6">
                    REVIEWED
                  </div>
                </div>
              </template>

              <!-- v. file -->
              <template v-else>
                <div class="absolute inset-x-0 top-0 flex gap-2 pl-4">
                  <span v-for="(t, i) in ['CSV', 'XLSX', 'JSON']" :key="t" class="p-tab num rounded-t-md px-4 pb-6 pt-1.5 text-xs font-bold text-white" :style="{ background: ['#2446c8', '#1f7a4d', '#c4352b'][i] }">{{ t }}</span>
                </div>
                <div class="absolute inset-x-0 bottom-0 top-8 overflow-hidden rounded-sm border border-[#9cc3a9] bg-[#f4fbf5] shadow-lg">
                  <div class="p-ledger-row num grid grid-cols-[1.2fr_1fr_0.8fr] border-b-2 border-[#9cc3a9] px-3 py-2 text-[11px] font-bold">
                    <span>invoice</span><span>item</span><span class="text-right">amount</span>
                  </div>
                  <div v-for="l in inv.lineItems" :key="l.description" class="p-ledger-row num grid grid-cols-[1.2fr_1fr_0.8fr] border-b border-[#cfe3d5] px-3 py-2 text-[11px]">
                    <span>{{ inv.number }}</span><span class="truncate">{{ l.description }}</span><span class="text-right">{{ money(l.amount) }}</span>
                  </div>
                  <div class="p-ledger-row num grid grid-cols-[1.2fr_1fr_0.8fr] border-b border-[#cfe3d5] px-3 py-2 text-[11px]">
                    <span>{{ inv.number }}</span><span>VAT 20%</span><span class="text-right">{{ money(inv.tax) }}</span>
                  </div>
                  <div class="p-ledger-row num grid grid-cols-[1.2fr_1fr_0.8fr] px-3 py-2 text-[11px] font-bold">
                    <span /><span>total</span><span class="text-right">{{ money(inv.correctedTotal) }}</span>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </article>
      </div>
    </section>

    <!-- HOW IT WORKS: cork board -->
    <section class="p-board relative py-24 sm:py-32">
      <div class="mx-auto max-w-6xl px-4 sm:px-6">
        <p class="p-hand text-2xl text-[#f6e7c8]">how it works</p>
        <h2 class="p-serif mt-1 text-4xl tracking-tight text-[#fffaf0] sm:text-6xl">Pin it, process it, file it.</h2>
        <ol class="mt-16 grid gap-10 md:grid-cols-3 md:gap-8">
          <li v-for="(s, i) in steps" :key="s.n" class="p-card relative bg-[#fffdf7] p-6 pt-10 shadow-[0_18px_30px_-12px_rgb(0_0_0/0.5)]" :style="{ rotate: `${[-2, 1.5, -1][i]}deg` }">
            <span class="p-pin absolute left-1/2 top-3 size-5 -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_35%_35%,#ff8a7a,#c4352b)] shadow-[0_3px_4px_rgb(0_0_0/0.4)]" aria-hidden="true" />
            <div class="absolute inset-x-0 top-0 h-1 bg-[var(--pen)]/70" />
            <p class="p-hand text-4xl text-[var(--pen)]">{{ s.n }}</p>
            <h3 class="p-serif mt-2 text-2xl">{{ s.title }}</h3>
            <p class="mt-2 text-sm leading-relaxed text-[#4a4740]">{{ s.body }}</p>
          </li>
        </ol>
      </div>
    </section>

    <!-- PROVIDERS: rubber stamps -->
    <section class="py-24 sm:py-32">
      <div class="mx-auto max-w-5xl px-4 sm:px-6">
        <div class="p-stamp-page p-ruled relative rounded-sm bg-card px-6 py-12 shadow-[0_20px_60px_-25px_rgb(0_0_0/0.35)] sm:px-14 sm:py-16">
          <p class="p-hand text-2xl text-[var(--pen)]">approved for use:</p>
          <h2 class="p-serif mt-1 text-4xl tracking-tight sm:text-6xl">Bring your own LLM.</h2>
          <p class="mt-4 max-w-2xl text-muted-foreground">
            Connect the providers you already pay for. Keys are encrypted at rest, every connection gets a default model, and each Document is sent in the form your model reads best.
          </p>
          <div class="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-10">
            <div
              v-for="(p, i) in providers"
              :key="p.name"
              class="p-stamp p-ink flex flex-col items-center rounded-md border-[3px] px-4 py-2 text-center uppercase"
              :style="{ color: stampInks[i % 3], borderColor: stampInks[i % 3], rotate: `${stampTilt[i]}deg` }"
            >
              <span class="text-lg font-black tracking-[0.15em] sm:text-xl">{{ p.name }}</span>
              <span class="num text-[10px] tracking-widest">{{ p.note }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- FAQ: notebook -->
    <section class="pb-24 sm:pb-32">
      <div class="mx-auto max-w-4xl px-4 sm:px-6">
        <div class="p-notebook relative rounded-sm bg-[#fffef9] py-12 pl-14 pr-6 shadow-[0_20px_60px_-25px_rgb(0_0_0/0.35)] sm:pl-24 sm:pr-12">
          <h2 class="p-serif text-4xl tracking-tight sm:text-5xl">Questions in the margin</h2>
          <div class="p-faqs mt-8">
            <details v-for="q in faqs" :key="q.q" class="p-faq group py-2" name="p-faq">
              <summary class="p-hand flex cursor-pointer list-none items-center justify-between gap-4 text-2xl sm:text-[1.7rem] [&::-webkit-details-marker]:hidden">
                {{ q.q }}
                <Plus class="size-5 shrink-0 text-[var(--pen)] transition-transform duration-300 group-open:rotate-45" />
              </summary>
              <p class="pb-2 pt-1 leading-8 text-[#3d3a34]">{{ q.a }}</p>
            </details>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA: receipt -->
    <section class="p-cta pb-24 sm:pb-32">
      <div class="mx-auto flex max-w-6xl flex-col items-center px-4 sm:px-6">
        <div class="relative z-10 h-4 w-[360px] max-w-full rounded-full bg-[#2b2a27] shadow-inner" aria-hidden="true" />
        <div class="p-receipt num relative -mt-2 w-[320px] max-w-[calc(100%-2rem)] bg-white px-6 pb-10 pt-8 text-sm shadow-xl">
          <p class="text-center font-bold tracking-[0.3em]">RECEIPT</p>
          <p class="text-center text-[10px] text-muted-foreground">Invoice Processing Assistant</p>
          <div class="my-4 border-t border-dashed border-black/30" />
          <p class="flex justify-between"><span>Values retyped</span><span>0</span></p>
          <p class="flex justify-between"><span>Checks per invoice</span><span>6</span></p>
          <p class="flex justify-between"><span>Export formats</span><span>3</span></p>
          <p class="flex justify-between"><span>LLM keys</span><span>yours</span></p>
          <div class="my-4 border-t border-dashed border-black/30" />
          <p class="flex justify-between font-bold"><span>TOTAL</span><span>self-hosted</span></p>
          <NuxtLink to="/auth/sign-up" class="p-btn mt-6 flex items-center justify-center gap-2 rounded-full bg-foreground py-3 font-sans text-background">
            Get started <ArrowRight class="size-4" />
          </NuxtLink>
          <p class="mt-4 text-center text-[10px] text-muted-foreground">thank you, come again</p>
        </div>
      </div>
    </section>

    <LandingFooter />
  </div>
</template>

<style scoped>
.paper {
  --background: #efe9dc;
  --card: #fbf8f1;
  --foreground: #1d1c1a;
  --muted-foreground: #5f5b52;
  --primary: #1d1c1a;
  --primary-foreground: #fbf8f1;
  --border: #d9d1bf;
  --pen: #c4352b;
  --hl: rgb(216 247 90 / 0.85);
  background-image: radial-gradient(rgb(0 0 0 / 0.035) 1px, transparent 1px);
  background-size: 6px 6px;
}
.p-serif { font-family: 'Fraunces Variable', Georgia, serif; font-variation-settings: 'SOFT' 50, 'WONK' 1; }
.p-hand { font-family: 'Caveat Variable', 'Segoe Print', cursive; }
.p-mark {
  background: linear-gradient(104deg, transparent 0.5%, var(--hl) 2%, var(--hl) 97%, transparent 99%) no-repeat left 62% / 0% 52%;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  padding: 0 0.1em;
}
.p-btn { transition: transform 0.2s, box-shadow 0.2s; box-shadow: 3px 3px 0 var(--pen); }
.p-btn:hover { transform: translate(-2px, -2px); box-shadow: 5px 5px 0 var(--pen); }
.p-ruled {
  background-image: repeating-linear-gradient(transparent 0 31px, rgb(36 70 200 / 0.08) 31px 32px);
}
.paper :deep(.hl) { background: var(--hl); }
.p-ink {
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.2 1.6'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E");
  mask-size: 200px;
  mix-blend-mode: multiply;
}
.p-board {
  background-color: #a9824f;
  background-image:
    radial-gradient(rgb(0 0 0 / 0.12) 1px, transparent 1.5px),
    radial-gradient(rgb(255 255 255 / 0.08) 1px, transparent 1.5px);
  background-size: 7px 7px, 11px 11px;
  background-position: 0 0, 3px 4px;
  box-shadow: inset 0 0 0 12px #6f5130, inset 0 0 40px rgb(0 0 0 / 0.4);
}
.p-notebook {
  background-image:
    linear-gradient(90deg, transparent 2.6rem, rgb(196 53 43 / 0.45) 2.6rem, rgb(196 53 43 / 0.45) calc(2.6rem + 1px), transparent calc(2.6rem + 1px)),
    repeating-linear-gradient(transparent 0 31px, rgb(36 70 200 / 0.14) 31px 32px);
}
@media (min-width: 640px) {
  .p-notebook {
    background-image:
      linear-gradient(90deg, transparent 4.5rem, rgb(196 53 43 / 0.45) 4.5rem, rgb(196 53 43 / 0.45) calc(4.5rem + 1px), transparent calc(4.5rem + 1px)),
      repeating-linear-gradient(transparent 0 31px, rgb(36 70 200 / 0.14) 31px 32px);
  }
}
.p-faqs { interpolate-size: allow-keywords; }
.p-faq::details-content { block-size: 0; overflow: hidden; transition: block-size 0.35s ease, content-visibility 0.35s allow-discrete; }
.p-faq[open]::details-content { block-size: auto; }
.p-receipt {
  mask: conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) bottom / 16px 100%;
}
@media (prefers-reduced-motion: reduce) {
  .p-mark { background-size: 100% 52%; }
}
</style>
