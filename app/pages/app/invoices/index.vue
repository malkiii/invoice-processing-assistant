<script setup lang="ts">
import { Check, Download, Search } from '@lucide/vue'
import { refDebounced } from '@vueuse/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

definePageMeta({ layout: 'app', middleware: 'auth' })
useHead({ title: 'Invoices' })

const route = useRoute()
const router = useRouter()
const q = (key: string) => (typeof route.query[key] === 'string' ? (route.query[key] as string) : '')

// Filters live in the URL so the table can be linked to and survives reloads.
const filters = reactive({
  search: q('search'),
  reviewed: q('reviewed'),
  checks: q('checks'),
  vendor: q('vendor'),
  from: q('from'),
  to: q('to'),
})
const query = computed(() =>
  Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')) as Record<string, string>,
)
watch(query, (next) => void router.replace({ query: next }))

const debounced = refDebounced(query, 250)
const { data: invoices, pending } = await useFetch('/api/invoices', { query: debounced })

// Export: the selected rows, or the whole current filter when nothing is selected.
const selected = ref<string[]>([])
watch(invoices, (rows) => {
  const visible = new Set((rows ?? []).map((r) => r.id))
  selected.value = selected.value.filter((id) => visible.has(id))
})
const allSelected = computed(() => !!invoices.value?.length && selected.value.length === invoices.value.length)
function toggleAll() {
  selected.value = allSelected.value ? [] : (invoices.value ?? []).map((r) => r.id)
}
const exportOpen = ref(false)
const exportScope = computed(() =>
  selected.value.length
    ? { kind: 'selection' as const, invoiceIds: selected.value }
    : {
        kind: 'filter' as const,
        filter: {
          search: filters.search || undefined,
          reviewed: filters.reviewed === '' ? undefined : filters.reviewed === 'true',
          checks: (filters.checks || undefined) as 'unchecked' | 'clean' | 'failing' | undefined,
          vendor: filters.vendor || undefined,
          dateFrom: filters.from || undefined,
          dateTo: filters.to || undefined,
        },
      },
)
const exportLabel = computed(() =>
  selected.value.length
    ? `${selected.value.length} selected Invoice${selected.value.length === 1 ? '' : 's'}`
    : 'Every Invoice matching the current filter',
)

function formatTotal(total: number | null, currency: string | null) {
  if (total == null) return '—'
  return `${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency ?? ''}`.trim()
}

const reviewedOptions = [
  { value: '', label: 'All' },
  { value: 'false', label: 'Not reviewed' },
  { value: 'true', label: 'Reviewed' },
]
const checksOptions = [
  { value: '', label: 'All' },
  { value: 'failing', label: 'Failing' },
  { value: 'clean', label: 'Clean' },
  { value: 'unchecked', label: 'Not checked' },
]
</script>

<template>
  <div class="grid grid-cols-1 gap-4">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h1 class="text-2xl font-semibold">Invoices</h1>
        <p class="text-sm text-muted-foreground">Invoices of each Document's Current Extraction.</p>
      </div>
      <Button variant="outline" size="sm" :disabled="!invoices?.length" data-testid="export-invoices" @click="exportOpen = true">
        <Download class="size-4" /> {{ selected.length ? `Export ${selected.length} selected` : 'Export all matching' }}
      </Button>
    </div>

    <form class="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap" role="search" @submit.prevent>
      <label class="relative col-span-2 grow basis-60">
        <span class="sr-only">Search</span>
        <Search class="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input v-model="filters.search" placeholder="Vendor, invoice number or file" class="pl-8" />
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">Reviewed
        <AppSelect v-model="filters.reviewed" :options="reviewedOptions" class="w-full sm:w-36" />
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">Checks
        <AppSelect v-model="filters.checks" :options="checksOptions" class="w-full sm:w-36" />
      </label>
      <label class="col-span-2 grid gap-1 text-xs text-muted-foreground">Vendor
        <Input v-model="filters.vendor" class="w-full sm:w-40" />
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">Issued from
        <Input v-model="filters.from" type="date" class="num w-full sm:w-40" />
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">to
        <Input v-model="filters.to" type="date" class="num w-full sm:w-40" />
      </label>
    </form>

    <div class="data-table-wrap" :aria-busy="pending">
      <table class="data-table">
        <thead>
          <tr>
            <th class="w-8">
              <input type="checkbox" :checked="allSelected" :disabled="!invoices?.length" aria-label="Select all Invoices" @change="toggleAll">
            </th>
            <th>Vendor</th>
            <th>Number</th>
            <th>Issued</th>
            <th class="text-right">Total</th>
            <th>Checks</th>
            <th>Reviewed</th>
            <th>Document</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="inv in invoices" :key="inv.id" class="hover:bg-accent/10">
            <td>
              <input v-model="selected" type="checkbox" :value="inv.id" :aria-label="`Select ${inv.invoiceNumber ?? inv.documentName}`">
            </td>
            <td>
              <NuxtLink :to="`/app/invoices/${inv.id}`" class="font-medium whitespace-nowrap hover:underline">{{ inv.vendorName ?? '—' }}</NuxtLink>
              <span v-if="inv.corrected" class="ml-1 text-xs text-primary" title="Has corrections">edited</span>
            </td>
            <td class="num whitespace-nowrap">{{ inv.invoiceNumber ?? '—' }}</td>
            <td class="num whitespace-nowrap">{{ inv.issueDate ?? '—' }}</td>
            <td class="num text-right whitespace-nowrap">{{ formatTotal(inv.total, inv.currency) }}</td>
            <td><ReviewCheckBadge :status="inv.checkStatus" :failed="inv.failedChecks" /></td>
            <td>
              <Check v-if="inv.reviewedAt" class="size-4 text-primary" aria-label="Reviewed" />
              <span v-else class="text-muted-foreground">—</span>
            </td>
            <td class="max-w-48 truncate text-muted-foreground" :title="inv.documentName">
              <NuxtLink :to="`/app/documents/${inv.documentId}`" class="hover:underline">{{ inv.documentName }}</NuxtLink>
            </td>
          </tr>
          <tr v-if="invoices && !invoices.length">
            <td colspan="8" class="py-8 text-center text-muted-foreground">No Invoices match.</td>
          </tr>
        </tbody>
      </table>
    </div>
    <ExportDialog v-model:open="exportOpen" :scope="exportScope" :scope-label="exportLabel" />
  </div>
</template>
