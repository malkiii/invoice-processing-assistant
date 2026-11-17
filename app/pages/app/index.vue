<script setup lang="ts">
definePageMeta({ layout: 'app', middleware: 'auth' })
useHead({ title: 'Dashboard' })

const { user } = useAuthSession()
const { data } = await useFetch('/api/dashboard')

function formatCost(cost: number | null | undefined) {
  return cost == null ? '—' : cost < 0.01 && cost > 0 ? cost.toFixed(4) : cost.toFixed(2)
}

function invoiceLabel(inv: { vendorName: string | null; invoiceNumber: string | null; documentName: string }) {
  return [inv.vendorName, inv.invoiceNumber].filter(Boolean).join(' · ') || inv.documentName
}
</script>

<template>
  <div class="grid gap-6">
    <div>
      <h1 class="text-2xl font-semibold">Dashboard</h1>
      <p class="text-sm text-muted-foreground">Welcome, {{ user?.name }}.</p>
    </div>

    <div v-if="data" class="grid gap-4 lg:grid-cols-3">
      <section class="grid content-start gap-3 rounded-lg border bg-card p-4 lg:col-span-2" aria-labelledby="needs-review">
        <div class="flex items-baseline justify-between">
          <h2 id="needs-review" class="font-medium">Needs review <span class="num text-muted-foreground">{{ data.needsReviewCount }}</span></h2>
          <NuxtLink to="/app/invoices?reviewed=false" class="text-sm text-muted-foreground underline">All</NuxtLink>
        </div>
        <p v-if="!data.needsReview.length" class="text-sm text-muted-foreground">Nothing waiting for Review.</p>
        <ul v-else class="divide-y">
          <li v-for="inv in data.needsReview" :key="inv.id" class="flex items-center justify-between gap-3 py-2 text-sm">
            <NuxtLink :to="`/app/invoices/${inv.id}`" class="min-w-0 truncate hover:underline">{{ invoiceLabel(inv) }}</NuxtLink>
            <ReviewCheckBadge :status="inv.checkStatus" :failed="inv.failedChecks" />
          </li>
        </ul>
      </section>

      <section class="grid content-start gap-2 rounded-lg border bg-card p-4" aria-labelledby="usage">
        <h2 id="usage" class="font-medium">Usage and cost</h2>
        <dl class="grid grid-cols-2 gap-y-1 text-sm">
          <dt class="text-muted-foreground">Extractions</dt><dd class="num text-right">{{ data.usage.extractions }}</dd>
          <dt class="text-muted-foreground">Tokens in</dt><dd class="num text-right">{{ data.usage.inputTokens.toLocaleString() }}</dd>
          <dt class="text-muted-foreground">Tokens out</dt><dd class="num text-right">{{ data.usage.outputTokens.toLocaleString() }}</dd>
          <dt class="text-muted-foreground">Est. cost</dt><dd class="num text-right">{{ formatCost(data.usage.estimatedCost) }}</dd>
        </dl>
      </section>

      <section class="grid content-start gap-3 rounded-lg border bg-card p-4 lg:col-span-3" aria-labelledby="recent-batches">
        <div class="flex items-baseline justify-between">
          <h2 id="recent-batches" class="font-medium">Recent Batches</h2>
          <NuxtLink to="/app/batches" class="text-sm text-muted-foreground underline">All</NuxtLink>
        </div>
        <p v-if="!data.recentBatches.length" class="text-sm text-muted-foreground">
          No Batches yet. <NuxtLink to="/app/intake" class="underline">Add Documents</NuxtLink>.
        </p>
        <ul v-else class="divide-y">
          <li v-for="b in data.recentBatches" :key="b.id" class="flex items-center justify-between gap-3 py-2 text-sm">
            <NuxtLink :to="`/app/batches/${b.id}`" class="hover:underline">{{ formatDateTime(b.createdAt) }} · {{ b.source }}</NuxtLink>
            <span class="num text-muted-foreground">{{ b.documentCount }} Documents</span>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
