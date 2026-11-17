<script setup lang="ts">
import { Trash2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'

definePageMeta({ layout: 'app', middleware: 'auth' })

const route = useRoute()
const id = route.params.id as string
const { data: doc, error, refresh } = await useFetch(`/api/documents/${id}`)
if (error.value?.statusCode === 404) throw createError({ statusCode: 404, statusMessage: 'Document not found' })
useHead({ title: () => doc.value?.name ?? 'Document' })

// Live status: the Batch's event stream also carries this Document's changes.
let source: EventSource | undefined
onMounted(() => {
  if (!doc.value) return
  source = new EventSource(`/api/batches/${doc.value.batchId}/events`)
  source.onopen = () => void refresh()
  source.addEventListener('status', (e) => {
    const change = JSON.parse((e as MessageEvent).data) as { documentId: string }
    if (change.documentId === id) void refresh()
  })
})
onBeforeUnmount(() => source?.close())

function formatCost(cost: number | null) {
  return cost == null ? '—' : cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2)
}

function invoiceTitle(values: Record<string, unknown>) {
  const vendor = (values.vendor as { name?: string } | null)?.name
  return [values.invoice_number, vendor].filter(Boolean).join(' · ') || 'Invoice'
}

const deleting = ref(false)
async function remove() {
  if (!doc.value || !confirm(`Delete “${doc.value.name}” and its file? This cannot be undone.`)) return
  deleting.value = true
  try {
    await $fetch(`/api/documents/${id}`, { method: 'DELETE' })
    await navigateTo(`/app/batches/${doc.value.batchId}`)
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div v-if="doc" class="grid gap-4">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <NuxtLink :to="`/app/batches/${doc.batchId}`" class="text-sm text-muted-foreground underline">Batch</NuxtLink>
        <h1 class="truncate text-2xl font-semibold" :title="doc.name">{{ doc.name }}</h1>
        <div class="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <DocumentStatusBadge :status="doc.status" :reason="doc.failureReason" />
          <span class="uppercase">{{ doc.format ?? '—' }}</span>
          <span class="num">{{ formatBytes(doc.sizeBytes) }}</span>
          <span v-if="doc.pageCount" class="num">{{ doc.pageCount }} pages</span>
        </div>
        <p v-if="doc.failureReason" class="mt-2 text-sm text-destructive">{{ doc.failureReason }}</p>
      </div>
      <Button variant="destructive" :disabled="deleting" @click="remove">
        <Trash2 class="size-4" /> Delete
      </Button>
    </div>

    <div class="min-h-[70svh] overflow-hidden rounded-lg border bg-card">
      <template v-if="doc.fileUrl">
        <img v-if="doc.mimeType?.startsWith('image/')" :src="doc.fileUrl" :alt="doc.name" class="mx-auto max-h-[80svh] object-contain">
        <iframe v-else-if="doc.format === 'pdf'" :src="doc.fileUrl" :title="doc.name" class="h-[80svh] w-full" />
        <!-- HTML Documents never run scripts or reach the app: fully sandboxed. -->
        <iframe v-else-if="doc.format === 'html'" :src="doc.fileUrl" :title="doc.name" sandbox="" class="h-[80svh] w-full bg-white" />
        <div v-else class="grid place-items-center gap-2 p-10 text-sm text-muted-foreground">
          <p>This format is shown once the Document is extracted.</p>
          <a :href="doc.fileUrl" class="underline">Open the file</a>
        </div>
      </template>
      <p v-else class="p-10 text-center text-sm text-muted-foreground">No file to show.</p>
    </div>

    <section v-if="doc.invoices.length" class="grid gap-2">
      <h2 class="text-lg font-semibold">Invoices <span class="num text-muted-foreground">{{ doc.invoices.length }}</span></h2>
      <ul class="divide-y rounded-lg border bg-card">
        <li v-for="inv in doc.invoices" :key="inv.id" class="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
          <span class="truncate">{{ invoiceTitle(inv.rawValues) }}</span>
          <span class="num text-muted-foreground">
            {{ inv.rawValues.total ?? '—' }} {{ inv.rawValues.currency ?? '' }}
          </span>
        </li>
      </ul>
    </section>

    <section class="grid gap-2">
      <h2 class="text-lg font-semibold">Extraction history</h2>
      <p v-if="!doc.extractions.length" class="text-sm text-muted-foreground">
        {{ doc.status === 'queued' || doc.status === 'processing' ? 'Waiting for the first Extraction…' : 'No Extractions yet.' }}
      </p>
      <div v-else class="overflow-x-auto rounded-lg border bg-card">
        <table class="w-full text-sm">
          <thead class="text-left text-muted-foreground">
            <tr>
              <th class="px-3 py-2 font-medium">When</th>
              <th class="px-3 py-2 font-medium">Model</th>
              <th class="px-3 py-2 font-medium">Template</th>
              <th class="px-3 py-2 text-right font-medium">Invoices</th>
              <th class="px-3 py-2 text-right font-medium">Tokens in / out</th>
              <th class="px-3 py-2 text-right font-medium">Duration</th>
              <th class="px-3 py-2 text-right font-medium">Est. cost</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr v-for="ex in doc.extractions" :key="ex.id" :class="ex.isCurrent ? 'bg-accent/10' : ''">
              <td class="px-3 py-2 whitespace-nowrap">
                {{ formatDateTime(ex.createdAt) }}
                <span v-if="ex.isCurrent" class="ml-2 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">current</span>
              </td>
              <td class="px-3 py-2">{{ ex.modelId }} <span class="text-muted-foreground">({{ ex.providerKind }})</span></td>
              <td class="px-3 py-2">{{ ex.templateName }}</td>
              <td class="num px-3 py-2 text-right">{{ ex.invoiceCount }}</td>
              <td class="num px-3 py-2 text-right">{{ ex.inputTokens }} / {{ ex.outputTokens }}</td>
              <td class="num px-3 py-2 text-right">{{ (ex.durationMs / 1000).toFixed(1) }} s</td>
              <td class="num px-3 py-2 text-right">{{ formatCost(ex.estimatedCost) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
