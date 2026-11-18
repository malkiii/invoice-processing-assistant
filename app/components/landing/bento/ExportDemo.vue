<script setup lang="ts">
import { Download } from '@lucide/vue'
import { sampleInvoice as inv } from '~/lib/landing/content'

/** Switch formats and watch the same Invoice re-render as CSV, an XLSX sheet or JSON. */
type Format = 'csv' | 'xlsx' | 'json'
const format = ref<Format>('csv')
const sheet = ref<'Invoices' | 'Line items'>('Invoices')
const queued = ref(0)
let timer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(timer))

const csv = [
  'invoice_number,vendor,date,item,qty,amount,total',
  ...inv.lineItems.map((l) => `${inv.number},Northwind…,${inv.issueDate},${l.description},${l.qty},${l.amount.toFixed(2)},${inv.correctedTotal.toFixed(2)}`),
]
const json = JSON.stringify(
  {
    invoice_number: inv.number,
    vendor_name: inv.vendor,
    total_amount: inv.correctedTotal,
    line_items: inv.lineItems.map((l) => ({ description: l.description, qty: l.qty, amount: l.amount })),
  },
  null,
  2,
)

function exportNow() {
  queued.value++
  clearTimeout(timer)
  timer = setTimeout(() => (queued.value = 0), 2200)
}
</script>

<template>
  <div class="flex h-full flex-col gap-3">
    <div class="flex items-center gap-2">
      <div class="flex rounded-lg border border-border p-0.5" role="tablist" aria-label="Export format">
        <button
          v-for="f in (['csv', 'xlsx', 'json'] as const)"
          :key="f"
          type="button"
          role="tab"
          :aria-selected="format === f"
          class="num rounded-md px-3 py-1 text-xs uppercase transition-colors"
          :class="format === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="format = f"
        >
          {{ f }}
        </button>
      </div>
      <button type="button" class="relative ml-auto flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:border-primary hover:text-primary" @click="exportNow">
        <Download class="size-3.5" /> Export
        <Transition name="b-toast">
          <span v-if="queued" class="num absolute -top-8 right-0 whitespace-nowrap rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground">
            added to downloads ({{ queued }})
          </span>
        </Transition>
      </button>
    </div>

    <div class="relative min-h-44 flex-1 overflow-hidden rounded-xl border border-border bg-background/70">
      <Transition name="b-fmt" mode="out-in">
        <pre v-if="format === 'csv'" key="csv" class="num overflow-x-auto p-3 text-[10px] leading-relaxed"><span v-for="(row, i) in csv" :key="i" class="block" :class="i === 0 ? 'text-primary' : ''">{{ row }}</span></pre>

        <div v-else-if="format === 'xlsx'" key="xlsx" class="flex h-full flex-col">
          <table class="num w-full border-collapse text-[10px]">
            <thead>
              <tr class="bg-muted text-muted-foreground"><th class="w-6 border border-border" /><th v-for="c in ['A', 'B', 'C']" :key="c" class="border border-border px-2 py-0.5 font-normal">{{ c }}</th></tr>
            </thead>
            <tbody v-if="sheet === 'Invoices'">
              <tr><td class="border border-border text-center text-muted-foreground">1</td><td class="border border-border px-2 py-1 font-semibold">invoice_number</td><td class="border border-border px-2 font-semibold">vendor</td><td class="border border-border px-2 font-semibold">total</td></tr>
              <tr><td class="border border-border text-center text-muted-foreground">2</td><td class="border border-border px-2 py-1">{{ inv.number }}</td><td class="border border-border px-2">Northwind</td><td class="border border-border px-2 text-right">{{ inv.correctedTotal.toFixed(2) }}</td></tr>
            </tbody>
            <tbody v-else>
              <tr><td class="border border-border text-center text-muted-foreground">1</td><td class="border border-border px-2 py-1 font-semibold">invoice_id</td><td class="border border-border px-2 font-semibold">item</td><td class="border border-border px-2 font-semibold">amount</td></tr>
              <tr v-for="(l, i) in inv.lineItems" :key="l.description"><td class="border border-border text-center text-muted-foreground">{{ i + 2 }}</td><td class="border border-border px-2 py-1">{{ inv.number }}</td><td class="border border-border px-2">{{ l.description }}</td><td class="border border-border px-2 text-right">{{ l.amount.toFixed(2) }}</td></tr>
            </tbody>
          </table>
          <div class="mt-auto flex gap-px border-t border-border text-[10px]">
            <button v-for="s in (['Invoices', 'Line items'] as const)" :key="s" type="button" class="px-3 py-1 transition-colors" :class="sheet === s ? 'bg-card text-primary' : 'text-muted-foreground'" @click="sheet = s">{{ s }}</button>
          </div>
        </div>

        <pre v-else key="json" class="b-json num overflow-auto p-3 text-[10px] leading-relaxed">{{ json }}</pre>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.b-fmt-enter-active, .b-fmt-leave-active { transition: all 0.28s cubic-bezier(0.2, 0.9, 0.3, 1); }
.b-fmt-enter-from { opacity: 0; transform: translateY(12px) scale(0.98); filter: blur(6px); }
.b-fmt-leave-to { opacity: 0; transform: translateY(-12px) scale(0.98); filter: blur(6px); }
.b-toast-enter-active, .b-toast-leave-active { transition: all 0.3s cubic-bezier(0.3, 1.5, 0.5, 1); }
.b-toast-enter-from, .b-toast-leave-to { opacity: 0; transform: translateY(8px) scale(0.8); }
.b-json { color: var(--muted-foreground); }
@media (prefers-reduced-motion: reduce) {
  .b-fmt-enter-active, .b-fmt-leave-active, .b-toast-enter-active, .b-toast-leave-active { transition: none; }
}
</style>
