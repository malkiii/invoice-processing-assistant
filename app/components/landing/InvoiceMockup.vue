<script setup lang="ts">
import { sampleInvoiceLines } from '~/lib/cursor-effects/invoice-sample'
</script>

<template>
  <!-- A scanned paper Invoice. Each line carries its field name for effects that read it. -->
  <div
    class="invoice-paper relative flex aspect-[3/4] w-full flex-col gap-3 rounded-md px-7 py-8 text-[13px] leading-snug shadow-2xl"
    aria-label="Sample scanned invoice"
  >
    <div class="mb-2 flex items-start justify-between">
      <div class="size-9 rounded-sm bg-[#22262d]/80" aria-hidden="true" />
      <span class="text-[11px] font-semibold tracking-[0.25em] text-[#22262d]/70">INVOICE</span>
    </div>
    <p
      v-for="line in sampleInvoiceLines"
      :key="line.field"
      data-scan-line
      :data-field="line.field"
      class="scan-line num whitespace-pre"
      :class="line.strong ? 'font-semibold text-[#14171c]' : 'text-[#2c3038]'"
    >
      {{ line.label }}
    </p>
    <div class="mt-auto h-px bg-[#22262d]/20" aria-hidden="true" />
    <p class="text-[11px] text-[#2c3038]/70">Payment within 30 days · IBAN FR76 3000 6000 0112</p>
  </div>
</template>

<style scoped>
.invoice-paper {
  background:
    radial-gradient(120% 80% at 20% 10%, rgb(255 255 255 / 0.5), transparent 60%),
    linear-gradient(180deg, #e9e6dd, #dcd8cc);
  color: #22262d;
}
</style>
