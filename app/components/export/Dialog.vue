<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'
import { Button } from '@/components/ui/button'

/**
 * Choosing an Export's format, CSV layout and the Reviewed only toggle (spec "Export"). The
 * scope (an Invoice, a selection, a Batch or a filter) comes from the page that opens it.
 */
type ExportScope = InternalApi['/api/exports']['post']['scope']

const props = defineProps<{ scope: ExportScope; scopeLabel: string }>()
const open = defineModel<boolean>('open', { default: false })

const { show, download } = useDownloads()
const dialog = ref<HTMLDialogElement>()
const format = ref<'csv' | 'xlsx' | 'json'>('csv')
const csvLayout = ref<'rows' | 'zip'>('rows')
const reviewedOnly = ref(false)
const busy = ref(false)
const error = ref('')

watch(open, (isOpen) => {
  if (isOpen) {
    error.value = ''
    dialog.value?.showModal()
  } else {
    dialog.value?.close()
  }
})

async function submit() {
  busy.value = true
  error.value = ''
  try {
    const created = await $fetch('/api/exports', {
      method: 'POST',
      body: {
        format: format.value,
        csvLayout: format.value === 'csv' ? csvLayout.value : undefined,
        reviewedOnly: reviewedOnly.value,
        scope: props.scope,
      },
    })
    open.value = false
    if (created.status === 'ready') download(created.id)
    show()
  } catch (e) {
    error.value = (e as { data?: { statusMessage?: string } }).data?.statusMessage ?? 'The Export could not be created.'
  } finally {
    busy.value = false
  }
}

const option = 'flex items-start gap-2 rounded-md border p-2 text-sm has-[:checked]:border-primary'
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border bg-card p-0 text-card-foreground backdrop:bg-black/60"
    aria-labelledby="export-title"
    @close="open = false"
  >
    <form class="grid gap-4 p-5" @submit.prevent="submit">
      <div>
        <h2 id="export-title" class="text-lg font-semibold">Export</h2>
        <p class="text-sm text-muted-foreground">{{ scopeLabel }}, with corrections applied.</p>
      </div>

      <fieldset class="grid gap-2">
        <legend class="mb-1 text-sm font-medium">Format</legend>
        <label :class="option"><input v-model="format" type="radio" value="csv" class="mt-0.5"> <span>CSV</span></label>
        <div v-if="format === 'csv'" class="grid gap-2 pl-6">
          <label :class="option">
            <input v-model="csvLayout" type="radio" value="rows" class="mt-0.5">
            <span>One row per line item<span class="block text-xs text-muted-foreground">Invoice Fields repeated on each row.</span></span>
          </label>
          <label :class="option">
            <input v-model="csvLayout" type="radio" value="zip" class="mt-0.5">
            <span>Two files in a zip<span class="block text-xs text-muted-foreground"><code>invoices.csv</code> and <code>line_items.csv</code>, linked by <code>invoice_id</code>.</span></span>
          </label>
        </div>
        <label :class="option">
          <input v-model="format" type="radio" value="xlsx" class="mt-0.5">
          <span>XLSX<span class="block text-xs text-muted-foreground">Invoices and Line items sheets.</span></span>
        </label>
        <label :class="option">
          <input v-model="format" type="radio" value="json" class="mt-0.5">
          <span>JSON<span class="block text-xs text-muted-foreground">Nested, Field by Field.</span></span>
        </label>
      </fieldset>

      <label class="flex items-center gap-2 text-sm">
        <input v-model="reviewedOnly" type="checkbox" data-testid="export-reviewed-only"> Reviewed only
      </label>

      <p v-if="error" class="text-sm text-destructive" role="alert">{{ error }}</p>

      <div class="flex justify-end gap-2">
        <Button type="button" variant="ghost" @click="open = false">Cancel</Button>
        <Button type="submit" :disabled="busy">{{ busy ? 'Exporting…' : 'Export' }}</Button>
      </div>
    </form>
  </dialog>
</template>
