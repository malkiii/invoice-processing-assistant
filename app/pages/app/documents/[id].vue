<script setup lang="ts">
import { RefreshCw, Trash2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'

definePageMeta({ layout: 'app', middleware: 'auth' })

const route = useRoute()
const id = route.params.id as string
const { data: doc, error, refresh } = await useFetch(`/api/documents/${id}`)
if (error.value?.statusCode === 404) throw createError({ statusCode: 404, statusMessage: 'Document not found' })
useHead({ title: () => doc.value?.name ?? 'Document' })

// Live status: the Batch's event stream also carries this Document's changes.
useBatchEvents(() => [doc.value?.batchId], {
  onOpen: () => void refresh(),
  onChange: (change) => {
    if (change.documentId === id) void refresh()
  },
})
const inFlight = computed(() => !!doc.value && IN_FLIGHT_STATUSES.includes(doc.value.status))

function formatCost(cost: number | null) {
  return cost == null ? '—' : cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2)
}

function invoiceTitle(values: Record<string, unknown>) {
  const vendor = (values.vendor as { name?: string } | null)?.name
  return [values.invoice_number, vendor].filter(Boolean).join(' · ') || 'Invoice'
}

const rerunOpen = ref(false)
const switching = ref('')
async function makeCurrent(extractionId: string) {
  switching.value = extractionId
  try {
    await $fetch(`/api/documents/${id}/current-extraction`, { method: 'PUT', body: { extractionId } })
    await refresh()
  } finally {
    switching.value = ''
  }
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
  <div v-if="doc" class="grid grid-cols-1 gap-4">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <NuxtLink :to="`/app/batches/${doc.batchId}`" class="text-sm text-muted-foreground underline">Batch</NuxtLink>
        <h1 class="text-2xl font-semibold break-all" :title="doc.name">{{ doc.name }}</h1>
        <div class="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <DocumentStatusBadge :status="doc.status" :reason="doc.failureReason" />
          <span class="uppercase">{{ doc.format ?? '—' }}</span>
          <span class="num">{{ formatBytes(doc.sizeBytes) }}</span>
          <span v-if="doc.pageCount" class="num">{{ doc.pageCount }} pages</span>
        </div>
        <p v-if="doc.failureReason" class="mt-2 text-sm text-destructive">{{ doc.failureReason }}</p>
      </div>
      <div class="flex gap-2">
        <Button
          variant="outline"
          :disabled="inFlight"
          @click="rerunOpen = true"
        >
          <RefreshCw class="size-4" /> Re-run
        </Button>
        <Button variant="destructive" :disabled="deleting" @click="remove">
          <Trash2 class="size-4" /> Delete
        </Button>
      </div>
    </div>

    <ReviewDocumentViewer
      :document-id="doc.id"
      :name="doc.name"
      :format="doc.format"
      :mime-type="doc.mimeType"
      :file-url="doc.fileUrl"
    />

    <section v-if="doc.invoices.length" class="grid gap-2">
      <h2 class="text-lg font-semibold">Invoices <span class="num text-muted-foreground">{{ doc.invoices.length }}</span></h2>
      <ul class="divide-y rounded-lg border bg-card">
        <li v-for="inv in doc.invoices" :key="inv.id" class="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
          <NuxtLink :to="`/app/invoices/${inv.id}`" class="truncate hover:underline">{{ invoiceTitle(inv.values) }}</NuxtLink>
          <span class="flex items-center gap-3">
            <span v-if="inv.reviewedAt" class="text-xs text-primary">Reviewed</span>
            <span class="num text-muted-foreground">{{ inv.values.total ?? '—' }} {{ inv.values.currency ?? '' }}</span>
          </span>
        </li>
      </ul>
    </section>

    <section class="grid gap-2">
      <h2 class="text-lg font-semibold">Extraction history</h2>
      <p v-if="!doc.extractions.length" class="text-sm text-muted-foreground">
        {{ inFlight ? 'Waiting for the first Extraction…' : 'No Extractions yet.' }}
      </p>
      <div v-else class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Model</th>
              <th>Template</th>
              <th class="text-right">Invoices</th>
              <th class="text-right">Tokens in / out</th>
              <th class="text-right">Duration</th>
              <th class="text-right">Est. cost</th>
              <th><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ex in doc.extractions" :key="ex.id" :class="ex.isCurrent ? 'bg-accent/10' : ''">
              <td class="whitespace-nowrap">
                {{ formatDateTime(ex.createdAt) }}
                <span v-if="ex.isCurrent" class="ml-2 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">current</span>
              </td>
              <td>{{ ex.modelId }} <span class="text-muted-foreground">({{ ex.providerKind }})</span></td>
              <td>{{ ex.templateName }}</td>
              <td class="num text-right whitespace-nowrap">{{ ex.invoiceCount }}</td>
              <td class="num text-right whitespace-nowrap">{{ ex.inputTokens }} / {{ ex.outputTokens }}</td>
              <td class="num text-right whitespace-nowrap">{{ (ex.durationMs / 1000).toFixed(1) }} s</td>
              <td class="num text-right whitespace-nowrap">{{ formatCost(ex.estimatedCost) }}</td>
              <td class="text-right">
                <Button v-if="!ex.isCurrent" variant="ghost" size="sm" :disabled="!!switching" @click="makeCurrent(ex.id)">Make current</Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <ReviewRerunDialog v-model:open="rerunOpen" :document-id="doc.id" @queued="refresh()" />
  </div>
</template>
