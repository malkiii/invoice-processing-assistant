<script setup lang="ts">
import { Button } from '@/components/ui/button'
import JourneyHome from '~/components/landing/journey/JourneyHome.vue'

const links = [
  { label: 'How it works', href: '#journey' },
  { label: 'Features', href: '#how' },
  { label: 'FAQ', href: '#faq' },
]

useHead({ title: 'Invoice Processing Assistant' })
</script>

<template>
  <div class="min-h-svh bg-background">
    <header class="sticky top-0 z-50 border-b border-white/10 bg-[#0b0d10]/75 text-[#e8e6e1] backdrop-blur-xl">
      <nav class="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <NuxtLink to="/" class="flex shrink-0 items-center gap-2 text-sm font-semibold">
          <span class="num rounded-sm bg-[#c6f432] px-1.5 text-[#0b0d10]">{ }</span>
          <span class="hidden md:inline">Invoice Processing Assistant</span>
        </NuxtLink>

        <ul class="flex min-w-0 items-center gap-4 text-xs text-[#9a9890] sm:gap-6 sm:text-sm">
          <li v-for="l in links" :key="l.href">
            <a :href="l.href" class="whitespace-nowrap transition-colors hover:text-[#e8e6e1]">{{ l.label }}</a>
          </li>
        </ul>

        <div class="flex shrink-0 gap-2">
          <Button as-child size="sm" variant="ghost" class="hidden text-[#e8e6e1] hover:bg-white/10 hover:text-white sm:inline-flex">
            <NuxtLink to="/auth/sign-in">Sign in</NuxtLink>
          </Button>
          <Button as-child size="sm" class="hidden bg-[#c6f432] text-[#0b0d10] hover:bg-[#c6f432]/90 sm:inline-flex">
            <NuxtLink to="/auth/sign-up">Get started</NuxtLink>
          </Button>
        </div>
      </nav>
    </header>

    <JourneyHome />
  </div>
</template>
