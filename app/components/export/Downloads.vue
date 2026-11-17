<script setup lang="ts">
import { Download, LoaderCircle, Trash2, TriangleAlert } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { ExportItem } from '~/composables/useDownloads'

/** The downloads history drawer in the `/app` layout. */
const { open, items, loading, refresh, downloadUrl, remove } = useDownloads()
const error = ref('')

watch(open, (isOpen) => {
  if (!isOpen) return
  error.value = ''
  refresh().catch(() => (error.value = 'Could not load your Exports.'))
})

const FORMAT_LABEL: Record<ExportItem['format'], string> = { csv: 'CSV', xlsx: 'XLSX', json: 'JSON' }
const SCOPE_LABEL: Record<ExportItem['scope']['kind'], string> = {
  invoice: 'one Invoice',
  batch: 'a Batch',
  selection: 'a selection',
  filter: 'a filter',
}

function describe(e: ExportItem) {
  const format = e.format === 'csv' && e.csvLayout === 'zip' ? 'CSV (zip)' : FORMAT_LABEL[e.format]
  const count = `${e.invoiceCount} Invoice${e.invoiceCount === 1 ? '' : 's'}`
  return `${format} · ${count} from ${SCOPE_LABEL[e.scope.kind]}${e.reviewedOnly ? ', Reviewed only' : ''}`
}

async function onRemove(id: string) {
  try {
    await remove(id)
  } catch {
    error.value = 'Could not delete that Export.'
  }
}
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent class="overflow-y-auto">
      <SheetHeader>
        <SheetTitle>Downloads</SheetTitle>
        <SheetDescription>Your past Exports. Large ones are prepared in the background.</SheetDescription>
      </SheetHeader>
      <p v-if="error" class="px-4 text-sm text-destructive" role="alert">{{ error }}</p>
      <p v-if="!items && loading" class="px-4 text-sm text-muted-foreground">Loading…</p>
      <p v-else-if="items && !items.length" class="px-4 text-sm text-muted-foreground">No Exports yet.</p>
      <ul class="grid gap-2 px-4 pb-4" data-testid="downloads">
        <li v-for="e in items ?? []" :key="e.id" class="grid gap-1 rounded-md border p-3 text-sm">
          <div class="flex items-center justify-between gap-2">
            <span class="num truncate font-medium" :title="e.fileName ?? undefined">{{ e.fileName ?? 'Preparing…' }}</span>
            <div class="flex shrink-0 items-center gap-1">
              <Button v-if="e.status === 'ready'" as="a" :href="downloadUrl(e.id)" variant="ghost" size="icon" :aria-label="`Download ${e.fileName}`">
                <Download class="size-4" />
              </Button>
              <LoaderCircle v-else-if="e.status === 'pending'" class="size-4 animate-spin text-muted-foreground" aria-label="Preparing" />
              <Button variant="ghost" size="icon" aria-label="Delete Export" @click="onRemove(e.id)">
                <Trash2 class="size-4" />
              </Button>
            </div>
          </div>
          <span class="text-muted-foreground">{{ describe(e) }}</span>
          <span class="text-xs text-muted-foreground">
            {{ formatDateTime(e.createdAt) }}<template v-if="e.status === 'ready'"> · {{ formatBytes(e.sizeBytes) }}</template>
          </span>
          <span v-if="e.status === 'failed'" class="flex items-center gap-1 text-destructive">
            <TriangleAlert class="size-4 shrink-0" /> {{ e.failureReason }}
          </span>
        </li>
      </ul>
    </SheetContent>
  </Sheet>
</template>
