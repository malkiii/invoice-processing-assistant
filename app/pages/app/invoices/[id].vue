<script setup lang="ts">
import { Check, ChevronRight, Download, RefreshCw, Undo2 } from '@lucide/vue'
import type { InternalApi } from 'nitropack/types'
import { Button } from '@/components/ui/button'

type InvoiceView = InternalApi['/api/invoices/:id']['get']
type InvoiceUpdate = InternalApi['/api/invoices/:id/reviewed']['put']

definePageMeta({ layout: 'app', middleware: 'auth' })

const route = useRoute()
const id = computed(() => route.params.id as string)
const { data: inv, error, refresh } = await useFetch<InvoiceView>(() => `/api/invoices/${id.value}`)
if (error.value?.statusCode === 404) throw createError({ statusCode: 404, statusMessage: 'Invoice not found' })

const title = computed(() => {
  const v = inv.value?.values as Record<string, unknown> | undefined
  const vendor = (v?.vendor as { name?: string } | null)?.name
  return [v?.invoice_number, vendor].filter(Boolean).join(' · ') || 'Invoice'
})
useHead({ title })

const view = ref<'table' | 'json'>('table')
const saving = ref(false)
const message = ref('')

async function mutate(request: () => Promise<InvoiceUpdate>) {
  saving.value = true
  message.value = ''
  try {
    const updated = await request()
    // Updates carry the Invoice only; keep the viewer fields from the page load.
    if (inv.value) inv.value = { ...inv.value, ...updated }
  } catch (e) {
    const err = e as { data?: { statusMessage?: string }; statusMessage?: string }
    message.value = err.data?.statusMessage ?? err.statusMessage ?? 'Could not save.'
    await refresh()
  } finally {
    saving.value = false
  }
}

function correct(path: string, value: unknown) {
  return mutate(() => $fetch<InvoiceUpdate>(`/api/invoices/${id.value}/corrections`, { method: 'PUT', body: { path, value } }))
}

function revert(path: string) {
  return mutate(() => $fetch<InvoiceUpdate>(`/api/invoices/${id.value}/corrections`, { method: 'DELETE', query: { path } }))
}

function setReviewed(reviewed: boolean) {
  return mutate(() => $fetch<InvoiceUpdate>(`/api/invoices/${id.value}/reviewed`, { method: 'PUT', body: { reviewed } }))
}

async function nextUnreviewed() {
  const { id: next } = await $fetch<{ id: string | null }>('/api/invoices/next-unreviewed', { query: { after: id.value } })
  if (next) await navigateTo(`/app/invoices/${next}`)
  else message.value = 'Every Invoice is reviewed.'
}

async function markAndNext() {
  await setReviewed(true)
  await nextUnreviewed()
}

// Keyboard: J / → next unreviewed, R toggles Reviewed, Shift+R marks reviewed and moves on.
function onKey(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('input, select, textarea, [contenteditable], dialog') || event.metaKey || event.ctrlKey || event.altKey) return
  if (!inv.value) return
  if (event.key === 'j' || event.key === 'ArrowRight') {
    event.preventDefault()
    void nextUnreviewed()
  } else if (event.key === 'R') {
    event.preventDefault()
    void markAndNext()
  } else if (event.key === 'r') {
    event.preventDefault()
    void setReviewed(!inv.value.reviewedAt)
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const failedChecks = computed(() => (inv.value?.checkResults ?? []).filter((r) => r.status === 'fail'))
const rerunOpen = ref(false)
const exportOpen = ref(false)
</script>

<template>
  <div v-if="inv" class="grid gap-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <NuxtLink :to="`/app/documents/${inv.documentId}`" class="text-sm text-muted-foreground underline">{{ inv.documentName }}</NuxtLink>
        <h1 class="truncate text-2xl font-semibold">{{ title }}</h1>
        <div class="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <ReviewCheckBadge :status="inv.checkStatus" :failed="failedChecks.map((c) => c.message)" />
          <span v-if="inv.reviewedAt" class="inline-flex items-center gap-1 text-primary" data-testid="reviewed"><Check class="size-4" /> Reviewed</span>
          <span v-else class="text-muted-foreground">Not reviewed</span>
          <span v-if="inv.correctedPaths.length" class="text-muted-foreground">· {{ inv.correctedPaths.length }} edited</span>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" @click="rerunOpen = true"><RefreshCw class="size-4" /> Re-run</Button>
        <Button v-if="inv.isCurrentExtraction" variant="outline" size="sm" @click="exportOpen = true"><Download class="size-4" /> Export</Button>
        <Button v-if="inv.reviewedAt" variant="outline" size="sm" :disabled="saving" @click="setReviewed(false)">
          <Undo2 class="size-4" /> Mark as unreviewed
        </Button>
        <Button v-else size="sm" :disabled="saving || !inv.isCurrentExtraction" @click="setReviewed(true)">
          <Check class="size-4" /> Mark as reviewed
        </Button>
        <Button variant="ghost" size="sm" title="Next unreviewed (J)" @click="nextUnreviewed">
          Next unreviewed <ChevronRight class="size-4" /> <kbd class="rounded border px-1 text-xs text-muted-foreground">J</kbd>
        </Button>
      </div>
    </div>

    <p v-if="!inv.isCurrentExtraction" class="rounded-md border border-dashed p-3 text-sm text-muted-foreground" data-testid="history-notice">
      This Invoice belongs to an earlier Extraction and is kept as history. Its corrections do not apply to the Current Extraction.
      <NuxtLink :to="`/app/documents/${inv.documentId}`" class="underline">Open the Document</NuxtLink> to switch the Current Extraction.
    </p>
    <p v-if="inv.templateChange !== 'none'" class="rounded-md border p-3 text-sm text-muted-foreground" data-testid="template-changed">
      {{ inv.templateChange === 'deleted' ? 'The Template this Extraction used has been deleted.' : 'The Template has changed since this Extraction ran.' }}
      Fields show as they were in “{{ inv.templateSnapshot.name }}” at the time; re-run to use the current Template.
    </p>
    <p v-if="message" class="text-sm text-destructive" role="alert">{{ message }}</p>

    <section v-if="failedChecks.length" class="rounded-lg border border-destructive/40 bg-destructive/5 p-3" aria-label="Failed Checks">
      <ul class="grid gap-1 text-sm">
        <li v-for="c in failedChecks" :key="c.id">
          <span class="text-destructive">{{ c.message }}</span>
          <template v-if="c.relatedInvoiceIds?.length">
            — see
            <NuxtLink v-for="(rel, i) in c.relatedInvoiceIds" :key="rel" :to="`/app/invoices/${rel}`" class="underline">
              {{ i ? ', ' : '' }}Invoice {{ i + 1 }}
            </NuxtLink>
          </template>
        </li>
      </ul>
    </section>

    <div class="grid gap-4 lg:grid-cols-2">
      <ReviewDocumentViewer
        class="lg:sticky lg:top-4 lg:self-start"
        :document-id="inv.documentId"
        :name="inv.documentName"
        :format="inv.documentFormat"
        :mime-type="inv.documentMimeType"
        :file-url="inv.fileUrl"
      />

      <div class="grid content-start gap-3">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">Fields</h2>
          <div class="inline-flex rounded-md border p-0.5 text-sm" role="tablist" aria-label="View">
            <button
              v-for="v in (['table', 'json'] as const)"
              :key="v"
              type="button"
              role="tab"
              :aria-selected="view === v"
              class="rounded px-3 py-1"
              :class="view === v ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground'"
              @click="view = v"
            >
              {{ v === 'table' ? 'Table' : 'JSON' }}
            </button>
          </div>
        </div>
        <ReviewInvoiceFields
          v-if="view === 'table'"
          :fields="inv.templateSnapshot.fields"
          :values="inv.values"
          :raw-values="inv.rawValues"
          :corrected-paths="inv.correctedPaths"
          :check-results="inv.checkResults"
          :disabled="saving || !inv.isCurrentExtraction"
          @correct="correct"
          @revert="revert"
        />
        <pre v-else class="num overflow-auto rounded-lg border bg-card p-3 text-xs" data-testid="invoice-json">{{ JSON.stringify(inv.values, null, 2) }}</pre>
        <p class="text-xs text-muted-foreground">
          Shortcuts: <kbd>J</kbd> next unreviewed · <kbd>R</kbd> toggle reviewed · <kbd>Shift</kbd>+<kbd>R</kbd> mark reviewed and go to next
        </p>
      </div>
    </div>

    <ExportDialog v-model:open="exportOpen" :scope="{ kind: 'invoice', invoiceId: inv.id }" scope-label="This Invoice" />
    <ReviewRerunDialog v-model:open="rerunOpen" :document-id="inv.documentId" @queued="navigateTo(`/app/documents/${inv.documentId}`)" />
  </div>
</template>
