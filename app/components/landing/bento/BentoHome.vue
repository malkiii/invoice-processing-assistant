<script setup lang="ts">
import { ArrowRight, Plus } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import LandingFooter from '~/components/landing/LandingFooter.vue'
import ChecksDemo from './ChecksDemo.vue'
import DropDemo from './DropDemo.vue'
import ExportDemo from './ExportDemo.vue'
import ProviderDemo from './ProviderDemo.vue'
import ReviewDemo from './ReviewDemo.vue'
import TemplateDemo from './TemplateDemo.vue'
import { faqs, features, headline, money, providers, sampleInvoice as inv, steps } from '~/lib/landing/content'

/**
 * Version 2, Bento: every feature is a small working demo. Visitors drop real files,
 * add Fields, break and fix Checks, correct a value and switch export formats.
 */
const root = ref<HTMLElement>()
const feature = Object.fromEntries(features.map((f) => [f.id, f])) as Record<(typeof features)[number]['id'], (typeof features)[number]>

const cards = [
  { f: feature.intake, demo: DropDemo, span: 'lg:col-span-3' },
  { f: { ...feature.extract, kicker: 'Providers', title: 'Bring your own LLM' }, demo: ProviderDemo, span: 'lg:col-span-3' },
  { f: feature.templates, demo: TemplateDemo, span: 'lg:col-span-2' },
  { f: feature.checks, demo: ChecksDemo, span: 'lg:col-span-4' },
  { f: feature.review, demo: ReviewDemo, span: 'lg:col-span-3' },
  { f: feature.export, demo: ExportDemo, span: 'lg:col-span-3' },
]

const heroDocs = [
  { name: 'northwind-0418.pdf', meta: '2 pages · native PDF' },
  { name: 'taxi-receipt.jpg', meta: 'image · vision' },
  { name: 'q4-supplies.docx', meta: 'DOCX · text' },
]
const heroInvoices = [
  { vendor: inv.vendor, number: inv.number, total: money(inv.rawTotal), flagged: true },
  { vendor: 'City Cabs Ltd', number: 'R-88213', total: '38.50', flagged: false },
  { vendor: 'Acme Office', number: 'AO-5521', total: '912.04', flagged: false },
]

useLandingMotion(root, ({ gsap, SplitText, ScrollTrigger, reduced }) => {
  const el = root.value!
  const cleanups: (() => void)[] = []

  // Card spotlight follows the pointer across the whole grid.
  const grid = el.querySelector<HTMLElement>('.b-grid')!
  const spot = (e: PointerEvent) => {
    grid.querySelectorAll<HTMLElement>('.b-card').forEach((card) => {
      const r = card.getBoundingClientRect()
      card.style.setProperty('--mx', `${e.clientX - r.left}px`)
      card.style.setProperty('--my', `${e.clientY - r.top}px`)
    })
  }
  grid.addEventListener('pointermove', spot)
  cleanups.push(() => grid.removeEventListener('pointermove', spot))

  if (reduced) return () => cleanups.forEach((fn) => fn())

  // Hero
  const title = SplitText.create('.b-title', { type: 'chars,words', mask: 'words' })
  gsap.from(title.chars, { yPercent: 120, rotate: 12, duration: 0.8, ease: 'back.out(1.6)', stagger: 0.015 })
  gsap.from('.b-hero-fade', { y: 20, opacity: 0, duration: 0.8, stagger: 0.1, delay: 0.5, ease: 'power3.out' })
  gsap.from('.b-app', { y: 120, opacity: 0, duration: 1.4, ease: 'expo.out', delay: 0.4 })
  gsap.fromTo('.b-app', { rotateX: 24, scale: 0.9 }, {
    rotateX: 0, scale: 1, ease: 'none',
    scrollTrigger: { trigger: '.b-app-wrap', start: 'top 85%', end: 'top 20%', scrub: true },
  })

  // The mini app replays a Batch on loop.
  const app = gsap.timeline({ repeat: -1, repeatDelay: 1.2, delay: 1.4 })
  heroDocs.forEach((_, i) => {
    const at = i * 0.45
    app.set(`.b-doc-${i}`, { attr: { 'data-state': 'run' } }, at)
      .to(`.b-doc-${i} .b-st`, { scrambleText: { text: 'extracting', chars: 'lowerCase', speed: 0.6 }, duration: 0.4 }, at)
      .fromTo(`.b-doc-${i} .b-pg`, { scaleX: 0 }, { scaleX: 1, duration: 1.3 + i * 0.2, ease: 'power1.inOut' }, at)
      .set(`.b-doc-${i}`, { attr: { 'data-state': 'done' } })
      .to(`.b-doc-${i} .b-st`, { scrambleText: { text: 'extracted', chars: 'lowerCase', speed: 0.6 }, duration: 0.3 }, '<')
      .fromTo(`.b-inv-${i}`, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35, ease: 'back.out(2)' }, '<')
  })
  app.fromTo('.b-batch-pg', { scaleX: 0 }, { scaleX: 1, duration: app.duration(), ease: 'none' }, 0)
    .to('.b-inv-0', { backgroundColor: 'rgb(255 92 92 / 0.08)', duration: 0.3 })
    .to('.b-inv-0 .b-total', { scrambleText: { text: money(inv.correctedTotal), chars: '0123456789', speed: 0.5 }, duration: 0.6 }, '+=1.2')
    .set('.b-inv-0', { attr: { 'data-state': 'fixed' } })
    .to('.b-inv-0', { backgroundColor: 'rgb(198 244 50 / 0.06)', duration: 0.3 }, '<')
    .to('.b-badge-fixed', { scale: 1.2, duration: 0.15, yoyo: true, repeat: 1 }, '<')
    .to('.b-app-body', { opacity: 0, duration: 0.4 }, '+=2.4')

  // Bento cards rise in as they enter
  ScrollTrigger.batch('.b-card', {
    start: 'top 90%',
    once: true,
    onEnter: (batch) => gsap.from(batch, { y: 70, opacity: 0, scale: 0.96, duration: 0.9, ease: 'expo.out', stagger: 0.1 }),
  })
  gsap.from('.b-step', {
    y: 50, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.15,
    scrollTrigger: { trigger: '.b-steps', start: 'top 80%' },
  })
  ScrollTrigger.batch('.b-faq', {
    start: 'top 92%', once: true,
    onEnter: (batch) => gsap.from(batch, { y: 30, opacity: 0, duration: 0.6, ease: 'power3.out', stagger: 0.06 }),
  })
  gsap.from('.b-cta', {
    scale: 0.9, opacity: 0, duration: 1, ease: 'expo.out',
    scrollTrigger: { trigger: '.b-cta', start: 'top 85%' },
  })

  return () => cleanups.forEach((fn) => fn())
})
</script>

<template>
  <div ref="root" class="bento overflow-x-clip">
    <!-- HERO -->
    <section class="relative overflow-hidden pt-20 sm:pt-28">
      <div class="b-aurora pointer-events-none absolute inset-x-0 top-0 h-[700px]" aria-hidden="true" />
      <div class="relative mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 text-center sm:px-6">
        <p class="b-hero-fade num rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
          <span class="text-primary">new</span> · every card on this page is a live demo
        </p>
        <h1 class="b-title text-4xl font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl">{{ headline.title }}</h1>
        <p class="b-hero-fade max-w-2xl text-lg text-muted-foreground">{{ headline.lead }}</p>
        <div class="b-hero-fade flex flex-wrap justify-center gap-3">
          <Button as-child size="lg"><NuxtLink to="/auth/sign-up">Get started <ArrowRight /></NuxtLink></Button>
          <Button as-child size="lg" variant="outline"><a href="#demos">Play with it</a></Button>
        </div>
      </div>

      <!-- Mini app -->
      <div class="b-app-wrap relative mx-auto mt-16 max-w-5xl px-4 [perspective:1400px] sm:px-6">
        <div class="b-app origin-top overflow-hidden rounded-2xl border border-border bg-card shadow-[0_40px_120px_-20px_rgb(198_244_50/0.25)]">
          <div class="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <span class="size-2.5 rounded-full bg-[#ff5f57]" /><span class="size-2.5 rounded-full bg-[#febc2e]" /><span class="size-2.5 rounded-full bg-[#28c840]" />
            <span class="num ml-3 text-xs text-muted-foreground">/app/batches/128</span>
          </div>
          <div class="flex">
            <aside class="hidden w-44 shrink-0 flex-col gap-1 border-r border-border p-3 text-xs text-muted-foreground sm:flex">
              <span class="rounded-md px-2 py-1.5">Dashboard</span>
              <span class="rounded-md px-2 py-1.5">Add documents</span>
              <span class="rounded-md bg-muted px-2 py-1.5 text-foreground">Batches</span>
              <span class="rounded-md px-2 py-1.5">Invoices</span>
              <span class="rounded-md px-2 py-1.5">Templates</span>
            </aside>
            <div class="b-app-body min-w-0 flex-1 p-4 sm:p-5">
              <div class="flex items-center justify-between text-sm">
                <span class="font-semibold">Batch #128</span>
                <span class="num text-xs text-muted-foreground">3 Documents</span>
              </div>
              <div class="mt-2 h-1 overflow-hidden rounded-full bg-border"><div class="b-batch-pg h-full origin-left bg-primary" /></div>

              <div class="mt-4 grid gap-1.5">
                <div v-for="(d, i) in heroDocs" :key="d.name" :class="`b-doc b-doc-${i}`" data-state="idle" class="grid grid-cols-[1fr_auto] items-center gap-x-4 rounded-lg border border-border px-3 py-2 text-xs">
                  <span class="num truncate">{{ d.name }} <span class="hidden text-muted-foreground sm:inline">· {{ d.meta }}</span></span>
                  <span class="b-st num w-20 text-right">queued</span>
                  <div class="col-span-2 mt-1.5 h-0.5 overflow-hidden rounded-full bg-border"><div class="b-pg h-full origin-left scale-x-0 bg-primary" /></div>
                </div>
              </div>

              <table class="mt-5 w-full text-left text-xs">
                <thead class="text-muted-foreground">
                  <tr><th class="pb-2 font-normal">Vendor</th><th class="hidden pb-2 font-normal sm:table-cell">Number</th><th class="pb-2 text-right font-normal">Total</th><th class="pb-2 text-right font-normal">Checks</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(r, i) in heroInvoices" :key="r.number" :class="`b-inv b-inv-${i}`" :data-state="r.flagged ? 'flagged' : 'clean'" class="border-t border-border">
                    <td class="py-2 pr-2">{{ r.vendor }}</td>
                    <td class="num hidden py-2 sm:table-cell">{{ r.number }}</td>
                    <td class="b-total num py-2 text-right">{{ r.total }}</td>
                    <td class="py-2 text-right">
                      <span class="b-badge-flag num rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] text-destructive">1 failed</span>
                      <span class="b-badge-fixed num rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">clean</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Provider marquee -->
      <div class="b-marquee relative mt-20 overflow-hidden border-y border-border py-5" aria-label="Supported providers">
        <div class="b-track flex w-max gap-12">
          <span v-for="(p, i) in [...providers, ...providers]" :key="i" class="flex items-center gap-2 whitespace-nowrap text-lg font-semibold text-muted-foreground/70" :aria-hidden="i >= providers.length">
            <span class="size-1.5 rounded-full bg-primary" />{{ p.name }}
          </span>
        </div>
      </div>
    </section>

    <!-- BENTO -->
    <section id="demos" class="py-24 sm:py-32">
      <div class="mx-auto max-w-6xl px-4 sm:px-6">
        <div class="mb-12 max-w-2xl">
          <p class="num text-xs tracking-[0.25em] text-primary">TRY IT</p>
          <h2 class="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Don't take our word for it. Click around.</h2>
        </div>
        <div class="b-grid grid gap-4 lg:grid-cols-6">
          <article v-for="c in cards" :key="c.f.id" class="b-card group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-card p-5 sm:p-6" :class="c.span">
            <div class="b-spot pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" aria-hidden="true" />
            <header class="relative">
              <p class="num text-[10px] tracking-[0.2em] text-primary">{{ c.f.kicker.toUpperCase() }}</p>
              <h3 class="mt-1 text-lg font-semibold">{{ c.f.title }}</h3>
              <p class="mt-1 text-sm text-muted-foreground">{{ c.f.body }}</p>
            </header>
            <div class="relative flex-1"><component :is="c.demo" /></div>
          </article>
        </div>
      </div>
    </section>

    <!-- HOW IT WORKS -->
    <section class="border-t border-border py-24 sm:py-32">
      <div class="mx-auto max-w-6xl px-4 sm:px-6">
        <p class="num text-xs tracking-[0.25em] text-primary">HOW IT WORKS</p>
        <h2 class="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">From inbox to spreadsheet in three moves.</h2>
        <ol class="b-steps mt-14 grid gap-4 md:grid-cols-3">
          <li v-for="(s, i) in steps" :key="s.n" class="b-step relative rounded-2xl border border-border bg-card p-6">
            <span class="num text-5xl font-semibold text-primary/20">{{ s.n }}</span>
            <h3 class="mt-4 text-xl font-semibold">{{ s.title }}</h3>
            <p class="mt-2 text-muted-foreground">{{ s.body }}</p>
            <span v-if="i < steps.length - 1" class="b-link absolute -right-4 top-1/2 z-10 hidden h-px w-4 md:block" aria-hidden="true" />
          </li>
        </ol>
      </div>
    </section>

    <!-- FAQ -->
    <section class="border-t border-border py-24 sm:py-32">
      <div class="mx-auto max-w-6xl px-4 sm:px-6">
        <p class="num text-xs tracking-[0.25em] text-primary">FAQ</p>
        <h2 class="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Good questions.</h2>
        <div class="b-faqs mt-12 grid items-start gap-4 md:grid-cols-2">
          <details v-for="f in faqs" :key="f.q" class="b-faq group rounded-2xl border border-border bg-card p-5 transition-colors open:border-primary/50">
            <summary class="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
              {{ f.q }}
              <span class="grid size-7 shrink-0 place-items-center rounded-full border border-border transition-all duration-300 group-open:rotate-45 group-open:border-primary group-open:bg-primary group-open:text-primary-foreground">
                <Plus class="size-4" />
              </span>
            </summary>
            <p class="pt-3 text-sm text-muted-foreground">{{ f.a }}</p>
          </details>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="px-4 pb-24 sm:px-6 sm:pb-32">
      <div class="b-cta b-border relative mx-auto max-w-6xl overflow-hidden rounded-3xl p-px">
        <div class="relative flex flex-col items-center gap-6 rounded-[calc(1.5rem-1px)] bg-card px-6 py-20 text-center">
          <h2 class="max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl">Your next Batch is one drop away.</h2>
          <p class="max-w-xl text-muted-foreground">Self-host it, connect a provider, and process your first invoices in minutes.</p>
          <Button as-child size="lg" class="h-12 px-8"><NuxtLink to="/auth/sign-up">Create your account <ArrowRight /></NuxtLink></Button>
        </div>
      </div>
    </section>

    <LandingFooter />
  </div>
</template>

<style scoped>
.b-aurora {
  background:
    radial-gradient(40% 50% at 30% 10%, rgb(198 244 50 / 0.16), transparent 70%),
    radial-gradient(35% 45% at 75% 0%, rgb(56 189 248 / 0.12), transparent 70%);
  filter: blur(20px);
}
.b-spot {
  background: radial-gradient(420px circle at var(--mx) var(--my), rgb(198 244 50 / 0.08), transparent 45%);
}
.b-card::before {
  content: '';
  position: absolute;
  inset: 0;
  padding: 1px;
  border-radius: inherit;
  background: radial-gradient(300px circle at var(--mx) var(--my), rgb(198 244 50 / 0.6), transparent 40%);
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
  pointer-events: none;
}

/* Mini app states, toggled by the GSAP loop through data-state. */
.b-doc[data-state='done'] .b-st { color: var(--primary); }
.b-doc[data-state='idle'] .b-st { color: var(--muted-foreground); }
.b-inv { opacity: 0; }
.b-badge-fixed { display: none; }
.b-inv[data-state='clean'] .b-badge-flag { display: none; }
.b-inv[data-state='clean'] .b-badge-fixed { display: inline; }
.b-inv[data-state='flagged'] .b-total { color: var(--destructive); }
.b-inv[data-state='fixed'] .b-badge-flag { display: none; }
.b-inv[data-state='fixed'] .b-badge-fixed { display: inline-block; }
.b-inv[data-state='fixed'] .b-total { color: var(--primary); }

.b-track { animation: b-marquee 30s linear infinite; }
.b-marquee:hover .b-track { animation-play-state: paused; }
.b-marquee { mask-image: linear-gradient(90deg, transparent, black 15%, black 85%, transparent); }
@keyframes b-marquee { to { transform: translateX(calc(-50% - 1.5rem)); } }

.b-link {
  background: linear-gradient(90deg, var(--primary), transparent);
  box-shadow: 0 0 12px var(--primary);
}

.b-border::before {
  content: '';
  position: absolute;
  inset: -50%;
  background: conic-gradient(from 0deg, transparent 0 70%, var(--primary) 85%, transparent 100%);
  animation: b-spin 5s linear infinite;
}
@keyframes b-spin { to { transform: rotate(1turn); } }

.b-faqs { interpolate-size: allow-keywords; }
.b-faq::details-content { block-size: 0; overflow: hidden; transition: block-size 0.35s ease, content-visibility 0.35s allow-discrete; }
.b-faq[open]::details-content { block-size: auto; }

@media (prefers-reduced-motion: reduce) {
  .b-inv { opacity: 1; }
  .b-track, .b-border::before { animation: none; }
}
</style>
