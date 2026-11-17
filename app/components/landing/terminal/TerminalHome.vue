<script setup lang="ts">
import { Check, Copy } from '@lucide/vue'
import LandingFooter from '~/components/landing/LandingFooter.vue'
import { faqs, features, headline, money, providers, sampleInvoice as inv, steps } from '~/lib/landing/content'

/**
 * Version 3, Terminal: the product told as a data pipeline. Worker logs stream, raw text
 * scrambles into JSON, Checks print like a test run and corrections read like a diff.
 */
const root = ref<HTMLElement>()
const copied = ref(false)
const COMMAND = 'docker compose up -d'
let copyTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(copyTimer))

async function copy() {
  try {
    await navigator.clipboard.writeText(COMMAND)
    copied.value = true
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => (copied.value = false), 1600)
  } catch {
    // Clipboard blocked: the command stays visible to select by hand.
  }
}

const log = [
  { t: '14:02:11', tag: 'batch', msg: '#128 received · 3 documents', tone: '' },
  { t: '14:02:11', tag: 'intake', msg: 'northwind-0418.pdf · 1.2 MB · 2 pages · within limits', tone: '' },
  { t: '14:02:12', tag: 'present', msg: 'model reads native PDF → sending file as-is', tone: '' },
  { t: '14:02:12', tag: 'extract', msg: 'template "Default" · snapshot a41f9c · 14 fields', tone: '' },
  { t: '14:02:18', tag: 'extract', msg: '1 invoice found', tone: 'ok' },
  { t: '14:02:18', tag: 'checks', msg: '5 passed · 1 failed (subtotal + tax ≠ total)', tone: 'bad' },
  { t: '14:02:18', tag: 'status', msg: 'extracted · needs review', tone: 'ok' },
]

const f = Object.fromEntries(features.map((x) => [x.id, x]))
const stages = [
  { id: 'intake', n: '01', name: 'intake', f: f.intake! },
  { id: 'present', n: '02', name: 'present', f: f.extract! },
  { id: 'extract', n: '03', name: 'extract', f: f.templates! },
  { id: 'checks', n: '04', name: 'checks', f: f.checks! },
  { id: 'review', n: '05', name: 'review', f: f.review! },
  { id: 'export', n: '06', name: 'export', f: f.export! },
]
const checkRows = [
  { pass: true, label: 'line items add up to subtotal', detail: '480.00 + 553.33 = 1,033.33' },
  { pass: false, label: 'subtotal + tax = total', detail: `1,033.33 + 206.67 = 1,240.00 ≠ ${money(inv.rawTotal)}` },
  { pass: true, label: 'due date ≥ issue date', detail: `${inv.issueDate} → ${inv.dueDate}` },
  { pass: true, label: 'currency is ISO 4217', detail: inv.currency },
  { pass: true, label: 'required fields present', detail: '14 / 14' },
  { pass: true, label: 'no possible duplicate', detail: 'vendor + number unique' },
]
const intakeRows = [
  { ok: true, name: 'northwind-0418.pdf', size: '1.2 MB', meta: '2 pages' },
  { ok: true, name: 'taxi-receipt.jpg', size: '840 KB', meta: 'image' },
  { ok: true, name: 'q4-supplies.docx', size: '310 KB', meta: '3 pages' },
  { ok: true, name: 'https://billing.example/inv/77', size: '96 KB', meta: 'html' },
  { ok: false, name: 'scanned-archive-2019.pdf', size: '48 MB', meta: 'over the 25 MB limit' },
]
const exportsOut = [
  { name: 'invoices.csv', size: '2.1 KB' },
  { name: 'invoices.xlsx', size: '7.8 KB' },
  { name: 'invoices.json', size: '3.4 KB' },
]

useLandingMotion(root, ({ gsap, ScrollTrigger, reduced }) => {
  if (reduced) return

  // Hero: the headline decodes, the worker log streams on loop.
  // Scramble each element into its own text (it starts scrambled, then decodes).
  const decode = (target: Element, vars: Record<string, unknown>, tween: gsap.TweenVars = {}) =>
    gsap.to(target, { scrambleText: { text: target.textContent ?? '', ...vars }, ...tween })
  decode(root.value!.querySelector('.t-title')!, { chars: '01{}[]<>$€#', revealDelay: 0.2 }, { duration: 1.8, ease: 'none' })
  gsap.from('.t-fade', { opacity: 0, y: 12, duration: 0.6, stagger: 0.12, delay: 0.8 })
  gsap.from('.t-window', { opacity: 0, y: 40, scale: 0.97, duration: 1, ease: 'expo.out', delay: 0.3 })

  const stream = gsap.timeline({ repeat: -1, repeatDelay: 3.5, delay: 0.9 })
  stream.fromTo('.t-log', { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.35, ease: 'steps(24)', stagger: 0.45 })
    .fromTo('.t-json-line', { opacity: 0, x: -6 }, { opacity: 1, x: 0, duration: 0.12, stagger: 0.06 }, '+=0.2')
    .fromTo('.t-json-bad', { backgroundColor: 'rgb(255 92 92 / 0)' }, { backgroundColor: 'rgb(255 92 92 / 0.2)', duration: 0.2, repeat: 3, yoyo: true })
    .to('.t-stream', { opacity: 0, duration: 0.4 }, '+=3')

  // Pipeline: the wire fills with scroll and each stage prints when reached.
  gsap.fromTo('.t-wire-fill', { scaleY: 0 }, {
    scaleY: 1, ease: 'none',
    scrollTrigger: { trigger: '.t-pipeline', start: 'top 60%', end: 'bottom 60%', scrub: 0.5 },
  })
  gsap.utils.toArray<HTMLElement>('.t-stage').forEach((stage) => {
    const tl = gsap.timeline({ scrollTrigger: { trigger: stage, start: 'top 62%', toggleActions: 'play none none reverse' } })
    tl.fromTo(stage.querySelector('.t-node'), { backgroundColor: 'var(--background)', boxShadow: '0 0 0 0 rgb(198 244 50 / 0)' }, { backgroundColor: 'var(--primary)', boxShadow: '0 0 0 8px rgb(198 244 50 / 0.15)', duration: 0.3 })
      .from(stage.querySelectorAll('.t-panel'), { opacity: 0, x: 30, duration: 0.5, ease: 'power3.out' }, 0)
      .fromTo(stage.querySelectorAll('.t-print'), { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.3, ease: 'steps(20)', stagger: 0.12 }, 0.2)
    const scramble = stage.querySelectorAll<HTMLElement>('.t-scramble')
    scramble.forEach((el, i) => tl.to(el, { scrambleText: { text: el.textContent ?? '', chars: '█▓▒░', speed: 0.4 }, duration: 0.6 }, 0.4 + i * 0.1))
    const bars = stage.querySelectorAll('.t-bar')
    if (bars.length) tl.fromTo(bars, { scaleX: 0 }, { scaleX: 1, duration: 1, ease: 'power2.inOut', stagger: 0.25 }, 0.4)
  })

  gsap.from('.t-step', {
    opacity: 0, y: 30, duration: 0.6, stagger: 0.15, ease: 'power3.out',
    scrollTrigger: { trigger: '.t-steps', start: 'top 80%' },
  })
  gsap.fromTo('.t-prov', { clipPath: 'inset(0 100% 0 0)' }, {
    clipPath: 'inset(0 0% 0 0)', duration: 0.3, ease: 'steps(30)', stagger: 0.12,
    scrollTrigger: { trigger: '.t-providers', start: 'top 75%' },
  })
  ScrollTrigger.batch('.t-faq', {
    start: 'top 92%', once: true,
    onEnter: (batch) => gsap.from(batch, { opacity: 0, x: -20, duration: 0.4, stagger: 0.07 }),
  })
  decode(root.value!.querySelector('.t-cta-title')!, { chars: '01', revealDelay: 0.3 }, {
    duration: 1.4,
    scrollTrigger: { trigger: '.t-cta', start: 'top 75%' },
  })
})
</script>

<template>
  <div ref="root" class="terminal relative overflow-x-clip font-mono">
    <div class="t-scan pointer-events-none fixed inset-0 z-40" aria-hidden="true" />

    <!-- HERO -->
    <section class="t-bg relative flex min-h-[calc(100svh-3.5rem)] items-center">
      <div class="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.1fr]">
        <div class="flex flex-col gap-6">
          <p class="t-fade text-xs text-muted-foreground"><span class="text-primary">~/invoices</span> $ cat README</p>
          <h1 class="t-title font-sans text-4xl font-semibold tracking-tight text-balance sm:text-6xl">{{ headline.title }}</h1>
          <p class="t-fade text-sm leading-relaxed text-muted-foreground sm:text-base"><span class="text-primary/60"># </span>{{ headline.lead }}</p>
          <div class="t-fade flex flex-wrap gap-3 text-sm">
            <NuxtLink to="/auth/sign-up" class="t-btn bg-primary px-5 py-2.5 font-semibold text-primary-foreground">[ get started ]</NuxtLink>
            <a href="#pipeline" class="t-btn border border-border px-5 py-2.5 hover:border-primary hover:text-primary">[ read the pipeline ]</a>
          </div>
        </div>

        <div class="t-window overflow-hidden rounded-lg border border-border bg-[#07090b] shadow-[0_0_80px_-20px_rgb(198_244_50/0.35)]">
          <div class="flex items-center justify-between border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
            <span>worker.log</span><span class="flex items-center gap-1.5"><span class="size-1.5 animate-pulse rounded-full bg-primary" /> live</span>
          </div>
          <div class="t-stream min-h-[420px] p-4 text-[11px] leading-relaxed sm:text-xs">
            <p v-for="(l, i) in log" :key="i" class="t-log whitespace-nowrap">
              <span class="text-muted-foreground/60">{{ l.t }}</span>
              <span class="mx-2 inline-block w-14 text-sky-300">{{ l.tag }}</span>
              <span :class="l.tone === 'ok' ? 'text-primary' : l.tone === 'bad' ? 'text-destructive' : ''">{{ l.msg }}</span>
            </p>
            <div class="mt-4 border-t border-dashed border-border pt-3">
              <p class="t-json-line text-muted-foreground/60">// raw values</p>
              <p class="t-json-line">{</p>
              <p class="t-json-line pl-4"><span class="text-sky-300">"vendor_name"</span>: <span class="text-primary">"{{ inv.vendor }}"</span>,</p>
              <p class="t-json-line pl-4"><span class="text-sky-300">"invoice_number"</span>: <span class="text-primary">"{{ inv.number }}"</span>,</p>
              <p class="t-json-line pl-4"><span class="text-sky-300">"line_items"</span>: [ <span class="text-muted-foreground">2 items</span> ],</p>
              <p class="t-json-line pl-4"><span class="text-sky-300">"subtotal"</span>: <span class="text-amber-300">{{ inv.subtotal }}</span>,</p>
              <p class="t-json-line pl-4"><span class="text-sky-300">"tax_amount"</span>: <span class="text-amber-300">{{ inv.tax }}</span>,</p>
              <p class="t-json-line t-json-bad -mx-1 rounded px-1 pl-5"><span class="text-sky-300">"total_amount"</span>: <span class="text-destructive">{{ inv.rawTotal.toFixed(2) }}</span> <span class="text-destructive/70">// ✗ check failed</span></p>
              <p class="t-json-line">}<span class="t-caret ml-1 inline-block h-3.5 w-2 translate-y-0.5 bg-primary" /></p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- PIPELINE -->
    <section id="pipeline" class="border-t border-border py-24 sm:py-32">
      <div class="mx-auto max-w-6xl px-4 sm:px-6">
        <p class="text-xs text-primary">## pipeline</p>
        <h2 class="mt-3 max-w-3xl font-sans text-3xl font-semibold tracking-tight sm:text-5xl">What happens to every Document, in order.</h2>

        <div class="t-pipeline relative mt-16">
          <div class="absolute bottom-0 left-[11px] top-0 w-px bg-border" aria-hidden="true">
            <div class="t-wire-fill absolute inset-0 origin-top bg-primary shadow-[0_0_12px_rgb(198_244_50/0.8)]" />
          </div>

          <div v-for="s in stages" :key="s.id" class="t-stage relative grid gap-4 pb-16 pl-10 last:pb-0 lg:grid-cols-[0.8fr_1.2fr] lg:gap-10">
            <span class="t-node absolute left-[5px] top-1.5 size-[13px] rounded-full border-2 border-primary bg-background" aria-hidden="true" />
            <div>
              <p class="text-xs text-muted-foreground">{{ s.n }} / <span class="text-primary">{{ s.name }}</span></p>
              <h3 class="mt-2 font-sans text-2xl font-semibold">{{ s.f.title }}</h3>
              <p class="mt-2 text-sm leading-relaxed text-muted-foreground">{{ s.f.body }}</p>
            </div>

            <div class="t-panel overflow-x-auto rounded-lg border border-border bg-[#07090b] p-4 text-[11px] leading-relaxed sm:text-xs">
              <template v-if="s.id === 'intake'">
                <p class="t-print text-muted-foreground"># batch #128 · limits: 25 MB, 30 pages</p>
                <p v-for="row in intakeRows" :key="row.name" class="t-print whitespace-nowrap" :class="row.ok ? '' : 'text-destructive'">
                  <span class="inline-block w-5" :class="row.ok ? 'text-primary' : ''">{{ row.ok ? '✓' : '✗' }}</span><span class="inline-block w-64">{{ row.name }}</span><span class="inline-block w-16">{{ row.size }}</span>{{ row.meta }}
                </p>
              </template>

              <template v-else-if="s.id === 'present'">
                <p class="t-print text-muted-foreground"># what the model can read → what it gets</p>
                <p class="t-print whitespace-nowrap"><span class="inline-block w-24 text-sky-300">native-pdf</span> → the PDF itself</p>
                <p class="t-print whitespace-nowrap"><span class="inline-block w-24 text-sky-300">vision</span> → rasterised page images</p>
                <p class="t-print whitespace-nowrap"><span class="inline-block w-24 text-sky-300">text-only</span> → extracted text</p>
                <p class="t-print mt-2 whitespace-nowrap text-primary">→ snapshot of template "Default" frozen as a41f9c</p>
              </template>

              <template v-else-if="s.id === 'extract'">
                <div class="grid gap-4 sm:grid-cols-2">
                  <div class="text-muted-foreground">
                    <p class="t-print">NORTHWIND PAPER CO.</p>
                    <p class="t-print">Invoice {{ inv.number }}</p>
                    <p class="t-print">Issued 14 Nov 2026</p>
                    <p class="t-print">A4 copy paper ×40 480.00</p>
                    <p class="t-print">Toner cartridge ×6 553.33</p>
                    <p class="t-print">Total due €1,2?0.00</p>
                  </div>
                  <div>
                    <p><span class="text-sky-300">vendor_name</span>: <span class="t-scramble text-primary">"{{ inv.vendor }}"</span></p>
                    <p><span class="text-sky-300">invoice_number</span>: <span class="t-scramble text-primary">"{{ inv.number }}"</span></p>
                    <p><span class="text-sky-300">invoice_date</span>: <span class="t-scramble text-primary">"{{ inv.issueDate }}"</span></p>
                    <p><span class="text-sky-300">line_items</span>: <span class="t-scramble text-amber-300">[2]</span></p>
                    <p><span class="text-sky-300">total_amount</span>: <span class="t-scramble text-destructive">{{ inv.rawTotal.toFixed(2) }}</span></p>
                  </div>
                </div>
              </template>

              <template v-else-if="s.id === 'checks'">
                <p v-for="c in checkRows" :key="c.label" class="t-print whitespace-nowrap">
                  <span class="mr-2 rounded px-1 font-bold" :class="c.pass ? 'bg-primary text-primary-foreground' : 'bg-destructive text-destructive-foreground'">{{ c.pass ? 'PASS' : 'FAIL' }}</span>
                  <span class="inline-block w-64">{{ c.label }}</span>
                  <span :class="c.pass ? 'text-muted-foreground' : 'text-destructive'">{{ c.detail }}</span>
                </p>
                <p class="t-print mt-2 text-muted-foreground">Checks: <span class="text-destructive">1 failed</span>, <span class="text-primary">5 passed</span> · no LLM involved</p>
              </template>

              <template v-else-if="s.id === 'review'">
                <p class="t-print text-muted-foreground">@@ invoice {{ inv.number }} @@</p>
                <p class="t-print pl-[2ch]">"subtotal": {{ inv.subtotal }},</p>
                <p class="t-print pl-[2ch]">"tax_amount": {{ inv.tax }},</p>
                <p class="t-print whitespace-nowrap bg-destructive/10 text-destructive">- "total_amount": {{ inv.rawTotal.toFixed(2) }}   <span class="opacity-60">// raw value, kept</span></p>
                <p class="t-print whitespace-nowrap bg-primary/10 text-primary">+ "total_amount": {{ inv.correctedTotal.toFixed(2) }}   <span class="opacity-60">// corrected</span></p>
                <p class="t-print mt-2 text-muted-foreground">checks re-run → <span class="text-primary">6 passed</span> · reviewed: <span class="text-primary">true</span></p>
              </template>

              <template v-else>
                <p class="t-print text-muted-foreground"># scope: batch #128 · reviewed only</p>
                <div v-for="e in exportsOut" :key="e.name" class="flex items-center gap-3 py-0.5">
                  <span class="w-28 shrink-0">{{ e.name }}</span>
                  <span class="relative h-2 flex-1 overflow-hidden bg-border"><span class="t-bar absolute inset-0 origin-left bg-primary" /></span>
                  <span class="w-14 shrink-0 text-right text-muted-foreground">{{ e.size }}</span>
                </div>
                <p class="t-print mt-2 text-primary">→ added to downloads</p>
              </template>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- HOW IT WORKS -->
    <section class="border-t border-border py-24 sm:py-32">
      <div class="mx-auto max-w-6xl px-4 sm:px-6">
        <p class="text-xs text-primary">## how it works</p>
        <h2 class="mt-3 font-sans text-3xl font-semibold tracking-tight sm:text-5xl">Three steps. One pipeline. No retyping.</h2>
        <ol class="t-steps mt-14 grid items-stretch gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <template v-for="(s, i) in steps" :key="s.n">
            <li class="t-step rounded-lg border border-border bg-[#07090b] p-5">
              <p class="text-xs text-muted-foreground">step {{ s.n }}/03</p>
              <h3 class="mt-3 text-lg font-semibold text-primary">&gt; {{ s.title.toLowerCase() }}</h3>
              <p class="mt-2 text-sm leading-relaxed text-muted-foreground">{{ s.body }}</p>
            </li>
            <li v-if="i < steps.length - 1" class="t-arrow hidden items-center text-primary md:flex" aria-hidden="true">──▶</li>
          </template>
        </ol>
      </div>
    </section>

    <!-- PROVIDERS -->
    <section class="t-providers border-t border-border py-24 sm:py-32">
      <div class="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p class="text-xs text-primary">## providers</p>
          <h2 class="mt-3 font-sans text-3xl font-semibold tracking-tight sm:text-5xl">Bring your own LLM.</h2>
          <p class="mt-4 text-sm leading-relaxed text-muted-foreground">
            Save as many Provider Connections as you like, each with a default model. Keys are encrypted at rest. Run fully local with Ollama, or point at any OpenAI-compatible base URL.
          </p>
        </div>
        <div class="overflow-x-auto rounded-lg border border-border bg-[#07090b] p-4 text-[11px] sm:text-xs">
          <p class="t-prov whitespace-nowrap text-muted-foreground"><span class="inline-block w-40">PROVIDER</span><span class="inline-block w-28">INPUT</span>STATUS</p>
          <p v-for="(p, i) in providers" :key="p.name" class="t-prov whitespace-nowrap border-t border-border/50 py-1.5">
            <span class="inline-block w-40">{{ p.name }}</span>
            <span class="inline-block w-28 text-sky-300">{{ p.note.toLowerCase() }}</span>
            <span class="inline-flex items-center gap-1.5" :class="i < 3 ? 'text-primary' : 'text-muted-foreground'">
              <span class="size-1.5 rounded-full" :class="i < 3 ? 't-blink bg-primary' : 'bg-muted-foreground/50'" :style="{ animationDelay: `${i * 0.3}s` }" />
              {{ i < 3 ? 'connected' : 'available' }}
            </span>
          </p>
        </div>
      </div>
    </section>

    <!-- FAQ -->
    <section class="border-t border-border py-24 sm:py-32">
      <div class="mx-auto max-w-4xl px-4 sm:px-6">
        <p class="text-xs text-primary">## faq</p>
        <h2 class="mt-3 font-sans text-3xl font-semibold tracking-tight sm:text-5xl">man invoice-processing-assistant</h2>
        <div class="t-faqs mt-10">
          <details v-for="q in faqs" :key="q.q" class="t-faq group border-b border-border py-4" name="t-faq">
            <summary class="flex cursor-pointer list-none gap-3 text-sm sm:text-base [&::-webkit-details-marker]:hidden">
              <span class="shrink-0 text-primary"><span class="group-open:hidden">[+]</span><span class="hidden group-open:inline">[-]</span></span>
              <span class="group-hover:text-primary">{{ q.q }}</span>
            </summary>
            <p class="pl-10 pt-3 text-sm leading-relaxed text-muted-foreground"><span class="text-primary/60">&gt; </span>{{ q.a }}</p>
          </details>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="t-cta t-bg border-t border-border py-28 sm:py-40">
      <div class="mx-auto flex max-w-3xl flex-col items-center gap-8 px-4 text-center sm:px-6">
        <h2 class="t-cta-title font-sans text-4xl font-semibold tracking-tight sm:text-6xl">Ship clean invoice data.</h2>
        <button type="button" class="group flex w-full max-w-md items-center justify-between gap-4 rounded-lg border border-border bg-[#07090b] px-4 py-3 text-left text-sm transition-colors hover:border-primary" @click="copy">
          <span><span class="text-primary">$</span> {{ COMMAND }}<span class="t-caret ml-1 inline-block h-4 w-2 translate-y-0.5 bg-primary" /></span>
          <Check v-if="copied" class="size-4 text-primary" /><Copy v-else class="size-4 text-muted-foreground group-hover:text-primary" />
        </button>
        <NuxtLink to="/auth/sign-up" class="t-btn bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground">[ create your account ]</NuxtLink>
      </div>
    </section>

    <LandingFooter />
  </div>
</template>

<style scoped>
.t-bg {
  background-image:
    radial-gradient(circle at 1px 1px, rgb(255 255 255 / 0.07) 1px, transparent 0);
  background-size: 22px 22px;
}
.t-scan {
  background: repeating-linear-gradient(to bottom, rgb(255 255 255 / 0.018) 0 1px, transparent 1px 3px);
  mix-blend-mode: overlay;
}
.t-btn { transition: transform 0.15s, box-shadow 0.2s; }
.t-btn:hover { transform: translate(-2px, -2px); box-shadow: 4px 4px 0 var(--primary); }
.t-caret { animation: t-caret 1s steps(1) infinite; }
@keyframes t-caret { 50% { opacity: 0; } }
.t-blink { animation: t-blink 1.6s ease-in-out infinite; }
@keyframes t-blink { 50% { opacity: 0.25; } }
.t-arrow { animation: t-march 1.2s linear infinite; }
@keyframes t-march { 0%, 100% { opacity: 0.4; transform: translateX(-3px); } 50% { opacity: 1; transform: translateX(3px); } }
.t-faqs { interpolate-size: allow-keywords; }
.t-faq::details-content { block-size: 0; overflow: hidden; transition: block-size 0.3s steps(6), content-visibility 0.3s allow-discrete; }
.t-faq[open]::details-content { block-size: auto; }
@media (prefers-reduced-motion: reduce) {
  .t-caret, .t-blink, .t-arrow { animation: none; }
}
</style>
