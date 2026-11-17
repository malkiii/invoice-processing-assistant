<script setup lang="ts">
definePageMeta({ layout: 'app', middleware: 'auth' })
useHead({ title: 'Dashboard' })

const { user } = useAuthSession()
</script>

<template>
  <div class="grid gap-6">
    <div>
      <h1 class="text-2xl font-semibold">Dashboard</h1>
      <p class="text-sm text-muted-foreground">Welcome, {{ user?.name }}.</p>
    </div>
    <div class="grid gap-4 sm:grid-cols-3">
      <div v-for="tile in ['Recent Batches', 'Invoices needing Review', 'Usage and cost']" :key="tile" class="rounded-lg border bg-card p-4">
        <p class="text-sm text-muted-foreground">{{ tile }}</p>
        <p class="num mt-2 text-2xl">0</p>
      </div>
    </div>
  </div>
</template>
