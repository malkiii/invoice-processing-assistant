<script setup lang="ts">
import { Button } from '@/components/ui/button'

// Placeholder: the full landing page with cursor effects arrives in ticket 02.
useHead({ title: 'Invoice Processing Assistant' })
</script>

<template>
  <main class="mx-auto flex min-h-svh max-w-3xl flex-col justify-center gap-6 px-6">
    <p class="num text-sm text-primary">total_amount: 1,240.00</p>
    <h1 class="text-4xl font-semibold tracking-tight sm:text-5xl">Turn invoice files into clean, reviewable data.</h1>
    <p class="text-lg text-muted-foreground">
      Self-hosted. Bring your own LLM provider. Review, correct and export every Invoice.
    </p>
    <div class="flex gap-3">
      <Button as-child><NuxtLink to="/auth/sign-up">Get started</NuxtLink></Button>
      <Button as-child variant="outline"><NuxtLink to="/auth/sign-in">Sign in</NuxtLink></Button>
    </div>
  </main>
</template>
