<script setup lang="ts">
import { Check, Search } from '@lucide/vue'
import { refDebounced } from '@vueuse/core'
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

function formatTotal(total: number | null, currency: string | null) {
  if (total == null) return '—'
  return `${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency ?? ''}`.trim()
}

const selectClass = 'h-9 rounded-md border bg-background px-2 text-sm'
</script>

<template>
  <div class="grid gap-4">
    <div>
      <h1 class="text-2xl font-semibold">Invoices</h1>
      <p class="text-sm text-muted-foreground">Invoices of each Document's Current Extraction.</p>
    </div>

    <form class="flex flex-wrap items-end gap-2" role="search" @submit.prevent>
      <label class="relative grow basis-60">
        <span class="sr-only">Search</span>
        <Search class="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input v-model="filters.search" placeholder="Vendor, invoice number or file" class="pl-8" />
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">Reviewed
        <select v-model="filters.reviewed" :class="selectClass">
          <option value="">All</option>
          <option value="false">Not reviewed</option>
          <option value="true">Reviewed</option>
        </select>
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">Checks
        <select v-model="filters.checks" :class="selectClass">
          <option value="">All</option>
          <option value="failing">Failing</option>
          <option value="clean">Clean</option>
          <option value="unchecked">Not checked</option>
        </select>
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">Vendor
        <Input v-model="filters.vendor" class="w-40" />
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">Issued from
        <Input v-model="filters.from" type="date" class="num w-40" />
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">to
        <Input v-model="filters.to" type="date" class="num w-40" />
      </label>
    </form>

    <div class="overflow-x-auto rounded-lg border bg-card" :aria-busy="pending">
      <table class="w-full text-sm">
        <thead class="text-left text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">Vendor</th>
            <th class="px-3 py-2 font-medium">Number</th>
            <th class="px-3 py-2 font-medium">Issued</th>
            <th class="px-3 py-2 text-right font-medium">Total</th>
            <th class="px-3 py-2 font-medium">Checks</th>
            <th class="px-3 py-2 font-medium">Reviewed</th>
            <th class="px-3 py-2 font-medium">Document</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr v-for="inv in invoices" :key="inv.id" class="hover:bg-accent/10">
            <td class="px-3 py-2">
              <NuxtLink :to="`/app/invoices/${inv.id}`" class="font-medium hover:underline">{{ inv.vendorName ?? '—' }}</NuxtLink>
              <span v-if="inv.corrected" class="ml-1 text-xs text-primary" title="Has corrections">edited</span>
            </td>
            <td class="num px-3 py-2">{{ inv.invoiceNumber ?? '—' }}</td>
            <td class="num px-3 py-2 whitespace-nowrap">{{ inv.issueDate ?? '—' }}</td>
            <td class="num px-3 py-2 text-right whitespace-nowrap">{{ formatTotal(inv.total, inv.currency) }}</td>
            <td class="px-3 py-2"><ReviewCheckBadge :status="inv.checkStatus" :failed="inv.failedChecks" /></td>
            <td class="px-3 py-2">
              <Check v-if="inv.reviewedAt" class="size-4 text-primary" aria-label="Reviewed" />
              <span v-else class="text-muted-foreground">—</span>
            </td>
            <td class="max-w-48 truncate px-3 py-2 text-muted-foreground" :title="inv.documentName">
              <NuxtLink :to="`/app/documents/${inv.documentId}`" class="hover:underline">{{ inv.documentName }}</NuxtLink>
            </td>
          </tr>
          <tr v-if="invoices && !invoices.length">
            <td colspan="7" class="px-3 py-8 text-center text-muted-foreground">No Invoices match.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
