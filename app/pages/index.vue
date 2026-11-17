<script setup lang="ts">
import type { Component } from 'vue'
import { Button } from '@/components/ui/button'
import type { CursorEffectName } from '~/lib/cursor-effects/selection'

useHead({ title: 'Invoice Processing Assistant' })

/**
 * Each effect is a lazily loaded component with the same contract: it takes the hero
 * element and cleans up everything it started on unmount (`useCursorEffectScope`).
 * Stage effects replace the document mockup; overlay effects sit above the whole hero.
 */
const effects: Record<CursorEffectName, { component: Component; stage: boolean }> = {
  lens: { component: defineAsyncComponent(() => import('~/components/landing/effects/LensEffect.vue')), stage: true },
  receipt: { component: defineAsyncComponent(() => import('~/components/landing/effects/ReceiptEffect.vue')), stage: false },
  stamp: { component: defineAsyncComponent(() => import('~/components/landing/effects/StampEffect.vue')), stage: false },
  particles: { component: defineAsyncComponent(() => import('~/components/landing/effects/ParticlesEffect.vue')), stage: false },
  ruler: { component: defineAsyncComponent(() => import('~/components/landing/effects/RulerEffect.vue')), stage: false },
  scanner: { component: defineAsyncComponent(() => import('~/components/landing/effects/ScannerEffect.vue')), stage: true },
}

const { choice, active, blockedReason, select } = useCursorEffect()
const hero = ref<HTMLElement>()
const effect = computed(() => (active.value && hero.value ? effects[active.value] : null))

const steps = [
  { n: '01', title: 'Upload', body: 'PDFs, scans, photos, spreadsheets or a URL. Files stay on your own storage.' },
  { n: '02', title: 'Extract', body: 'Your LLM provider fills the fields of a Template you define, with checks on every value.' },
  { n: '03', title: 'Review & export', body: 'Correct what the checks flag, then export clean CSV, XLSX or JSON.' },
]
</script>

<template>
  <div class="min-h-svh bg-background">
    <header class="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
      <nav class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <NuxtLink to="/" class="flex items-center gap-2 text-sm font-semibold">
          <span class="num rounded-sm bg-primary px-1.5 text-primary-foreground">{ }</span>
          Invoice Processing Assistant
        </NuxtLink>
        <LandingCursorSwitcher
          class="order-last w-full sm:order-none sm:w-auto"
          :choice="choice"
          :blocked-reason="blockedReason"
          @select="select"
        />
        <div class="flex gap-2">
          <Button as-child size="sm" variant="ghost"><NuxtLink to="/auth/sign-in">Sign in</NuxtLink></Button>
          <Button as-child size="sm"><NuxtLink to="/auth/sign-up">Get started</NuxtLink></Button>
        </div>
      </nav>
    </header>

    <main>
      <section ref="hero" class="relative overflow-hidden" :data-cursor-effect="active ?? 'static'">
        <div class="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div class="relative z-10 flex flex-col gap-6">
            <p class="num text-sm text-primary" data-field-tip="total_amount: 1,240.00">total_amount: 1,240.00</p>
            <h1 class="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Turn <span data-field-tip='document_type: "invoice"'>invoice files</span> into
              <span data-field-tip='status: "checks_passed"'>clean</span>,
              <span data-field-tip="line_items: 2 · tax_amount: 206.67">reviewable data</span>.
            </h1>
            <p class="max-w-xl text-lg text-muted-foreground">
              Self-hosted. Bring your own <span data-field-tip='provider: "openai" | "anthropic" | "ollama"'>LLM provider</span>.
              Review, correct and export every
              <span data-field-tip='invoice_number: "INV-2026-0418"'>Invoice</span>.
            </p>
            <div class="flex gap-3">
              <Button as-child><NuxtLink to="/auth/sign-up">Get started</NuxtLink></Button>
              <Button as-child variant="outline"><NuxtLink to="/auth/sign-in">Sign in</NuxtLink></Button>
            </div>
          </div>

          <div class="relative z-10 mx-auto w-full max-w-sm">
            <component :is="effect.component" v-if="effect?.stage" :key="active!" :hero="hero!" />
            <LandingInvoiceMockup v-else />
          </div>
        </div>

        <div v-if="effect && !effect.stage" class="pointer-events-none absolute inset-0 z-20 overflow-hidden">
          <component :is="effect.component" :key="active!" :hero="hero!" />
        </div>
      </section>

      <section class="border-t border-border/60">
        <ol class="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:grid-cols-3 sm:px-6">
          <li v-for="step in steps" :key="step.n" class="flex flex-col gap-2">
            <span class="num text-xs text-primary">{{ step.n }}</span>
            <h2 class="font-semibold">{{ step.title }}</h2>
            <p class="text-sm text-muted-foreground">{{ step.body }}</p>
          </li>
        </ol>
      </section>
    </main>
  </div>
</template>
