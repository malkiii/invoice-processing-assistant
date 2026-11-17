<script setup lang="ts">
import { money, sampleInvoice as inv } from '~/lib/landing/content'

/**
 * The sample Invoice as a printed sheet. Each line carries `data-line="<field>"` and a
 * `.hl` highlight layer (scaleX 0 by default) that versions animate to show extraction.
 */
const lines = [
  { field: 'invoice_number', label: 'Invoice', value: inv.number },
  { field: 'invoice_date', label: 'Issued', value: '14 Nov 2026' },
  { field: 'due_date', label: 'Due', value: '14 Dec 2026' },
]
</script>

<template>
  <div class="sample-paper relative flex h-full w-full flex-col gap-2.5 overflow-hidden rounded-[3px] px-[8%] py-[9%] text-[11px] leading-tight text-[#22262d] shadow-2xl">
    <div class="flex items-start justify-between">
      <div data-line="vendor_name" class="relative">
        <span class="hl" aria-hidden="true" />
        <p class="relative text-[13px] font-semibold tracking-tight text-[#111]">{{ inv.vendor }}</p>
        <p class="relative text-[9px] text-[#22262d]/60">12 rue des Papetiers, Lyon · VAT {{ inv.vatId }}</p>
      </div>
      <span class="text-[9px] font-semibold tracking-[0.3em] text-[#22262d]/60">INVOICE</span>
    </div>

    <div class="mt-1 grid gap-1">
      <div v-for="l in lines" :key="l.field" :data-line="l.field" class="relative flex justify-between">
        <span class="hl" aria-hidden="true" />
        <span class="relative text-[#22262d]/60">{{ l.label }}</span>
        <span class="num relative">{{ l.value }}</span>
      </div>
    </div>

    <div class="mt-2 border-t border-[#22262d]/15 pt-2">
      <div class="mb-1 flex justify-between text-[9px] uppercase tracking-wider text-[#22262d]/50">
        <span>Item</span><span>Amount</span>
      </div>
      <div
        v-for="(item, i) in inv.lineItems"
        :key="item.description"
        :data-line="`line_items[${i}]`"
        class="relative flex justify-between py-0.5"
      >
        <span class="hl" aria-hidden="true" />
        <span class="relative">{{ item.description }} <span class="num text-[#22262d]/50">×{{ item.qty }}</span></span>
        <span class="num relative">€{{ money(item.amount) }}</span>
      </div>
    </div>

    <div class="mt-auto grid gap-1 border-t border-[#22262d]/15 pt-2">
      <div data-line="subtotal" class="relative flex justify-between">
        <span class="hl" aria-hidden="true" />
        <span class="relative text-[#22262d]/60">Subtotal</span><span class="num relative">€{{ money(inv.subtotal) }}</span>
      </div>
      <div data-line="tax_amount" class="relative flex justify-between">
        <span class="hl" aria-hidden="true" />
        <span class="relative text-[#22262d]/60">VAT 20%</span><span class="num relative">€{{ money(inv.tax) }}</span>
      </div>
      <div data-line="total_amount" class="relative flex justify-between text-[13px] font-semibold text-[#111]">
        <span class="hl" aria-hidden="true" />
        <span class="relative">Total due</span><span class="num relative">€{{ money(inv.correctedTotal) }}</span>
      </div>
    </div>
    <p class="text-[8px] text-[#22262d]/50">Payment within 30 days · IBAN FR76 3000 6000 0112 3456</p>
  </div>
</template>

<style scoped>
.sample-paper {
  background:
    radial-gradient(120% 80% at 15% 0%, rgb(255 255 255 / 0.65), transparent 60%),
    linear-gradient(180deg, #f1eee6, #e2ddd0);
}
.hl {
  position: absolute;
  inset: -2px -4px;
  border-radius: 2px;
  background: rgb(198 244 50 / 0.55);
  transform: scaleX(0);
  transform-origin: left center;
}
</style>
