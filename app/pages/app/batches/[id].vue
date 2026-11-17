<script setup lang="ts">
import { Download } from '@lucide/vue'
import { Button } from '@/components/ui/button'

definePageMeta({ layout: 'app', middleware: 'auth' })
useHead({ title: 'Batch' })
const exportOpen = ref(false)

const route = useRoute()
const id = route.params.id as string
const { data: batch, error, refresh } = await useFetch(`/api/batches/${id}`)
if (error.value?.statusCode === 404) throw createError({ statusCode: 404, statusMessage: 'Batch not found' })

interface StatusEvent {
  documentId: string
  status: string
  failureReason: string | null
}

let source: EventSource | undefined
onMounted(() => {
  source = new EventSource(`/api/batches/${id}/events`)
  // Reload on (re)connect so nothing missed while disconnected is lost.
  source.onopen = () => void refresh()
  source.addEventListener('status', (e) => {
    const change = JSON.parse((e as MessageEvent).data) as StatusEvent
    const doc = batch.value?.documents.find((d) => d.id === change.documentId)
    if (!doc) return void refresh()
    doc.status = change.status as typeof doc.status
    doc.failureReason = change.failureReason
  })
})
onBeforeUnmount(() => source?.close())

const counts = computed(() => {
  const result: Record<string, number> = {}
  for (const d of batch.value?.documents ?? []) result[d.status] = (result[d.status] ?? 0) + 1
  return result
})
</script>

<template>
  <div v-if="batch" class="grid gap-6">
    <div>
      <NuxtLink to="/app/batches" class="text-sm text-muted-foreground underline">Batches</NuxtLink>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h1 class="text-2xl font-semibold">Batch of {{ formatDateTime(batch.createdAt) }}</h1>
        <Button variant="outline" size="sm" :disabled="!counts.extracted" @click="exportOpen = true">
          <Download class="size-4" /> Export
        </Button>
      </div>
      <div class="mt-2 flex flex-wrap gap-2 text-sm">
        <span v-for="(n, status) in counts" :key="status" class="inline-flex items-center gap-1">
          <DocumentStatusBadge :status="String(status)" /> <span class="num">{{ n }}</span>
        </span>
      </div>
    </div>
    <table class="w-full text-sm">
      <thead class="text-left text-muted-foreground">
        <tr>
          <th class="py-2 font-normal">Document</th>
          <th class="py-2 font-normal">Format</th>
          <th class="py-2 text-right font-normal">Size</th>
          <th class="py-2 text-right font-normal">Pages</th>
          <th class="py-2 font-normal">Status</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="d in batch.documents" :key="d.id" class="border-t align-top" data-testid="batch-document">
          <td class="py-2">
            <NuxtLink :to="`/app/documents/${d.id}`" class="underline">{{ d.name }}</NuxtLink>
            <p v-if="d.failureReason" class="text-xs text-destructive">{{ d.failureReason }}</p>
          </td>
          <td class="py-2 uppercase">{{ d.format ?? '—' }}</td>
          <td class="num py-2 text-right">{{ formatBytes(d.sizeBytes) }}</td>
          <td class="num py-2 text-right">{{ d.pageCount ?? '—' }}</td>
          <td class="py-2"><DocumentStatusBadge :status="d.status" :reason="d.failureReason" /></td>
        </tr>
      </tbody>
    </table>
    <ExportDialog v-model:open="exportOpen" :scope="{ kind: 'batch', batchId: batch.id }" scope-label="Every Invoice in this Batch" />
  </div>
</template>
