<script setup lang="ts">
import { Plus, X } from '@lucide/vue'

type Kind = 'text' | 'date' | 'number' | 'list'
interface Field { key: string; kind: Kind; hint: string; children?: string[] }

const fields = ref<Field[]>([
  { key: 'vendor_name', kind: 'text', hint: 'Legal name of the seller' },
  { key: 'invoice_date', kind: 'date', hint: 'Date the invoice was issued' },
  { key: 'line_items', kind: 'list', hint: 'One entry per billed line', children: ['description', 'qty', 'amount'] },
  { key: 'total_amount', kind: 'number', hint: 'Grand total including tax' },
])
const suggestions: Field[] = [
  { key: 'po_number', kind: 'text', hint: 'Buyer purchase order reference' },
  { key: 'due_date', kind: 'date', hint: 'Payment deadline' },
  { key: 'iban', kind: 'text', hint: 'Bank account to pay into' },
  { key: 'tax_rate', kind: 'number', hint: 'VAT percentage applied' },
]
const available = computed(() => suggestions.filter((s) => !fields.value.some((f) => f.key === s.key)))
const kindClass: Record<Kind, string> = {
  text: 'bg-sky-400/15 text-sky-300',
  date: 'bg-violet-400/15 text-violet-300',
  number: 'bg-amber-400/15 text-amber-300',
  list: 'bg-primary/15 text-primary',
}

function addField() {
  const next = available.value[0]
  if (next) fields.value.splice(fields.value.length - 1, 0, { ...next })
}
function remove(key: string) {
  fields.value = fields.value.filter((f) => f.key !== key)
}
</script>

<template>
  <div class="flex h-full flex-col gap-2">
    <TransitionGroup tag="ul" name="b-field" class="relative flex flex-col gap-1.5">
      <li v-for="f in fields" :key="f.key" class="group rounded-lg border border-border bg-background/60 px-3 py-2">
        <div class="flex items-center gap-2 text-xs">
          <span class="num font-medium">{{ f.key }}</span>
          <span class="num rounded px-1.5 py-0.5 text-[10px]" :class="kindClass[f.kind]">{{ f.kind }}</span>
          <button type="button" class="ml-auto text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100" :aria-label="`Remove ${f.key}`" @click="remove(f.key)">
            <X class="size-3.5" />
          </button>
        </div>
        <p class="mt-0.5 text-[11px] text-muted-foreground">{{ f.hint }}</p>
        <div v-if="f.children" class="mt-1.5 flex gap-1 border-l border-primary/40 pl-2">
          <span v-for="c in f.children" :key="c" class="num rounded bg-muted px-1.5 py-0.5 text-[10px]">{{ c }}</span>
        </div>
      </li>
    </TransitionGroup>
    <button
      type="button"
      class="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs text-muted-foreground transition-colors enabled:hover:border-primary enabled:hover:text-primary disabled:opacity-40"
      :disabled="!available.length"
      @click="addField"
    >
      <Plus class="size-3.5" /> {{ available.length ? `Add ${available[0]!.key}` : 'That is plenty' }}
    </button>
  </div>
</template>

<style scoped>
.b-field-enter-active, .b-field-leave-active, .b-field-move { transition: all 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.25); }
.b-field-enter-from { opacity: 0; transform: scale(0.85) translateY(10px); }
.b-field-leave-to { opacity: 0; transform: translateX(-30px); }
.b-field-leave-active { position: absolute; width: 100%; }
@media (prefers-reduced-motion: reduce) {
  .b-field-enter-active, .b-field-leave-active, .b-field-move { transition: none; }
}
</style>
