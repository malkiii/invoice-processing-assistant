<script setup lang="ts">
import { Check, X } from '@lucide/vue'
import { money, runSampleChecks, sampleInvoice as inv } from '~/lib/landing/content'

/** Edit the extracted values and watch the same kind of deterministic Checks re-run live. */
const total = ref(money(inv.rawTotal))
const dueDate = ref(inv.dueDate)
const currency = ref(inv.currency)

const parse = (s: string) => Number.parseFloat(s.replace(/,/g, ''))
const results = computed(() =>
  runSampleChecks({
    lineAmounts: inv.lineItems.map((l) => l.amount),
    subtotal: inv.subtotal,
    tax: inv.tax,
    total: Number.isNaN(parse(total.value)) ? 0 : parse(total.value),
    issueDate: inv.issueDate,
    dueDate: dueDate.value,
    currency: currency.value,
  }),
)
const failed = computed(() => results.value.filter((r) => !r.pass).length)
</script>

<template>
  <div class="flex h-full flex-col gap-3">
    <div class="grid grid-cols-3 gap-2 text-[11px]">
      <label class="grid gap-1 text-muted-foreground">
        total_amount
        <input v-model="total" inputmode="decimal" class="num w-full rounded-md border bg-card px-2 py-1.5 text-xs text-foreground outline-none transition-colors focus:border-primary" :class="results[1]!.pass ? 'border-border' : 'border-destructive'">
      </label>
      <label class="grid gap-1 text-muted-foreground">
        due_date
        <input v-model="dueDate" class="num w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary">
      </label>
      <label class="grid gap-1 text-muted-foreground">
        currency
        <input v-model="currency" maxlength="3" class="num w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs uppercase text-foreground outline-none focus:border-primary">
      </label>
    </div>

    <ul class="flex flex-col gap-1">
      <li v-for="r in results" :key="r.id" class="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors duration-300" :class="r.pass ? 'bg-transparent' : 'bg-destructive/10'">
        <Transition name="b-icon" mode="out-in">
          <Check v-if="r.pass" class="size-3.5 shrink-0 text-primary" />
          <X v-else class="size-3.5 shrink-0 text-destructive" />
        </Transition>
        <span class="flex-1">{{ r.label }}</span>
        <span class="num hidden text-[10px] text-muted-foreground sm:inline">{{ r.detail }}</span>
      </li>
    </ul>

    <Transition name="b-icon" mode="out-in">
      <p v-if="failed" key="bad" class="num mt-auto text-xs text-destructive">{{ failed }} Check failed · try 1,240.00</p>
      <p v-else key="ok" class="num mt-auto text-xs text-primary">All Checks pass ✓</p>
    </Transition>
  </div>
</template>

<style scoped>
.b-icon-enter-active, .b-icon-leave-active { transition: all 0.25s cubic-bezier(0.3, 1.5, 0.5, 1); }
.b-icon-enter-from, .b-icon-leave-to { opacity: 0; transform: scale(0.3) rotate(-30deg); }
@media (prefers-reduced-motion: reduce) {
  .b-icon-enter-active, .b-icon-leave-active { transition: none; }
}
</style>
