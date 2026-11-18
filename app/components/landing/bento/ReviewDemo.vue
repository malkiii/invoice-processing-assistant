<script setup lang="ts">
import { RotateCcw } from '@lucide/vue'
import SampleInvoicePaper from '~/components/landing/SampleInvoicePaper.vue'
import { money, sampleFields, sampleInvoice as inv } from '~/lib/landing/content'

/** Hover a Field to find it on the Document. Correct the total, then mark the Invoice reviewed. */
const paper = ref<HTMLElement>()
const active = ref<string | null>(null)
const editing = ref(false)
const corrected = ref<string | null>(null)
const draft = ref(money(inv.rawTotal))
const reviewed = ref(false)
const fields = sampleFields.filter((f) => ['vendor_name', 'invoice_number', 'invoice_date', 'subtotal', 'tax_amount', 'total_amount'].includes(f.key))

watch(active, (key) => {
  paper.value?.querySelectorAll<HTMLElement>('[data-line] .hl').forEach((hl) => {
    const on = hl.parentElement?.dataset.line === key
    hl.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1)'
    hl.style.transform = on ? 'scaleX(1)' : 'scaleX(0)'
  })
})

const flagged = computed(() => corrected.value === null)
function save() {
  editing.value = false
  corrected.value = draft.value === money(inv.rawTotal) ? null : draft.value
}
function revert() {
  corrected.value = null
  draft.value = money(inv.rawTotal)
  reviewed.value = false
}
</script>

<template>
  <div class="grid h-full grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] gap-4">
    <div ref="paper" class="relative aspect-[3/4] self-start">
      <SampleInvoicePaper />
      <Transition name="b-stamp">
        <div v-if="reviewed" class="num pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-md border-[3px] border-primary bg-background/20 px-3 py-1 text-lg font-black tracking-widest text-primary backdrop-blur-[1px]">
          REVIEWED
        </div>
      </Transition>
    </div>

    <div class="flex min-w-0 flex-col gap-1">
      <div
        v-for="f in fields"
        :key="f.key"
        class="flex cursor-default items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs transition-colors"
        :class="[active === f.key ? 'bg-primary/10' : '', f.key === 'total_amount' && flagged ? 'bg-destructive/10' : '']"
        tabindex="0"
        @mouseenter="active = f.key"
        @mouseleave="active = null"
        @focus="active = f.key"
        @blur="active = null"
      >
        <span class="num truncate text-muted-foreground">{{ f.key }}</span>
        <template v-if="f.key !== 'total_amount'"><span class="num truncate">{{ f.value }}</span></template>
        <template v-else>
          <input
            v-if="editing"
            v-model="draft"
            class="num w-20 rounded border border-primary bg-card px-1 text-right text-xs outline-none"
            autofocus
            @keydown.enter="save"
            @blur="save"
          >
          <span v-else class="flex items-center gap-1">
            <button v-if="corrected" type="button" class="text-muted-foreground hover:text-foreground" aria-label="Revert to raw value" @click="revert"><RotateCcw class="size-3" /></button>
            <button type="button" class="num rounded px-1 underline decoration-dotted underline-offset-4" :class="corrected ? 'text-primary' : 'text-destructive'" @click="editing = true">
              {{ corrected ?? money(inv.rawTotal) }}
            </button>
          </span>
        </template>
      </div>
      <p class="num px-2 pt-1 text-[10px]" :class="flagged ? 'text-destructive' : 'text-primary'">
        {{ flagged ? 'subtotal + tax ≠ total · click the total to fix it' : `edited · raw value ${money(inv.rawTotal)} kept` }}
      </p>
      <button
        type="button"
        class="mt-auto rounded-md px-3 py-2 text-xs font-medium transition-all"
        :class="reviewed ? 'bg-primary text-primary-foreground' : 'border border-border hover:border-primary hover:text-primary'"
        @click="reviewed = !reviewed"
      >
        {{ reviewed ? 'Reviewed ✓ (undo)' : 'Mark as reviewed' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.b-stamp-enter-active { animation: b-stamp 0.45s cubic-bezier(0.3, 1.6, 0.5, 1) both; }
.b-stamp-leave-active { transition: opacity 0.2s; }
.b-stamp-leave-to { opacity: 0; }
@keyframes b-stamp {
  from { opacity: 0; transform: translate(-50%, -50%) rotate(-30deg) scale(2.6); }
  to { opacity: 1; transform: translate(-50%, -50%) rotate(-12deg) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .b-stamp-enter-active { animation: none; }
}
</style>
