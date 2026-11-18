<script setup lang="ts">
definePageMeta({ layout: 'app', middleware: 'auth' })
useHead({ title: 'Documents' })

const { data: documents } = await useFetch('/api/documents', { default: () => [] })

// Follow the Batches that still have Documents in flight and patch rows as they change.
const inFlightBatches = computed(() => [
  ...new Set(documents.value.filter((d) => IN_FLIGHT_STATUSES.includes(d.status)).map((d) => d.batchId)),
])
useBatchEvents(inFlightBatches, {
  onChange: (change) => {
    const doc = documents.value.find((d) => d.id === change.documentId)
    if (!doc) return
    doc.status = change.status as typeof doc.status
    doc.failureReason = change.failureReason
  },
})
</script>

<template>
  <div class="grid grid-cols-1 gap-6">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-2xl font-semibold">Documents</h1>
      <NuxtLink to="/app/intake" class="text-sm underline">Add Documents</NuxtLink>
    </div>
    <p v-if="!documents.length" class="text-sm text-muted-foreground">No Documents yet.</p>
    <div v-else class="data-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Document</th>
            <th>Added</th>
            <th>Format</th>
            <th class="text-right">Size</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in documents" :key="d.id" class="align-top">
            <td class="min-w-48">
              <NuxtLink :to="`/app/documents/${d.id}`" class="break-all underline">{{ d.name }}</NuxtLink>
              <p v-if="d.failureReason" class="text-xs text-destructive">{{ d.failureReason }}</p>
            </td>
            <td class="whitespace-nowrap">
              <NuxtLink :to="`/app/batches/${d.batchId}`" class="text-muted-foreground underline">{{ formatDateTime(d.createdAt) }}</NuxtLink>
            </td>
            <td class="uppercase">{{ d.format ?? '—' }}</td>
            <td class="num text-right whitespace-nowrap">{{ formatBytes(d.sizeBytes) }}</td>
            <td><DocumentStatusBadge :status="d.status" :reason="d.failureReason" /></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
