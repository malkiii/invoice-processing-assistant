<script setup lang="ts">
definePageMeta({ layout: 'app', middleware: 'auth' })
useHead({ title: 'Batches' })

const { data: batches, refresh } = await useFetch('/api/batches', { default: () => [] })

// Keep in-flight Batches live: any status change reloads the counts.
const inFlight = computed(() =>
  batches.value.filter((b) => Object.keys(b.statusCounts).some((s) => IN_FLIGHT_STATUSES.includes(s))).map((b) => b.id),
)
useBatchEvents(inFlight, { onChange: () => void refresh() })
</script>

<template>
  <div class="grid grid-cols-1 gap-6">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-2xl font-semibold">Batches</h1>
      <NuxtLink to="/app/intake" class="text-sm underline">Add Documents</NuxtLink>
    </div>
    <p v-if="!batches.length" class="text-sm text-muted-foreground">No Batches yet.</p>
    <div v-else class="data-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Added</th>
            <th>Source</th>
            <th class="text-right">Documents</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in batches" :key="b.id">
            <td class="whitespace-nowrap">
              <NuxtLink :to="`/app/batches/${b.id}`" class="underline">{{ formatDateTime(b.createdAt) }}</NuxtLink>
            </td>
            <td>{{ b.source }}</td>
            <td class="num text-right">{{ b.documentCount }}</td>
            <td>
              <div class="flex flex-wrap gap-2">
                <span v-for="(n, status) in b.statusCounts" :key="status" class="inline-flex items-center gap-1">
                  <DocumentStatusBadge :status="status" /> <span class="num text-xs">{{ n }}</span>
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
