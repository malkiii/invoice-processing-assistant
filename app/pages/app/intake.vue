<script setup lang="ts">
import { FilePlus, FolderPlus, UploadCloud } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

definePageMeta({ layout: 'app', middleware: 'auth' })
useHead({ title: 'Intake' })

const { items, batchId, busy, error, start } = useUploadBatch()
const fileInput = ref<HTMLInputElement>()
const folderInput = ref<HTMLInputElement>()
const dragging = ref(false)

async function onDrop(e: DragEvent) {
  dragging.value = false
  if (e.dataTransfer) await start(await filesFromDrop(e.dataTransfer))
}

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  await start(filesFromInput(input.files))
  input.value = ''
}

const summary = computed(() => {
  const done = items.value.filter((i) => i.phase === 'done')
  return {
    done: done.length,
    queued: done.filter((i) => i.status === 'queued').length,
    failed: done.filter((i) => i.status === 'failed').length,
  }
})
</script>

<template>
  <div class="grid max-w-4xl gap-6">
    <div>
      <h1 class="text-2xl font-semibold">Intake</h1>
      <p class="text-sm text-muted-foreground">
        Add Documents from your computer: PDF, DOCX, PNG, JPEG, WEBP or HTML. Each drop or pick creates one Batch.
      </p>
    </div>

    <div
      class="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors"
      :class="dragging ? 'border-primary bg-primary/5' : 'border-border'"
      data-testid="drop-zone"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <UploadCloud class="size-8 text-muted-foreground" />
      <p class="text-sm">Drop files or folders here</p>
      <div class="flex flex-wrap justify-center gap-2">
        <Button variant="outline" :disabled="busy" @click="fileInput?.click()">
          <FilePlus class="size-4" /> Choose files
        </Button>
        <Button variant="outline" :disabled="busy" @click="folderInput?.click()">
          <FolderPlus class="size-4" /> Choose a folder
        </Button>
      </div>
      <input ref="fileInput" type="file" multiple class="hidden" data-testid="file-input" @change="onPick">
      <input ref="folderInput" type="file" webkitdirectory class="hidden" @change="onPick">
    </div>

    <FormError :message="error" />

    <Card v-if="items.length">
      <CardHeader>
        <CardTitle>Uploads</CardTitle>
        <CardDescription>
          <span class="num">{{ summary.done }}</span> of <span class="num">{{ items.length }}</span> checked ·
          <span class="num">{{ summary.queued }}</span> queued ·
          <span class="num">{{ summary.failed }}</span> failed
          <template v-if="batchId">
            · <NuxtLink :to="`/app/batches/${batchId}`" class="underline">View Batch</NuxtLink>
          </template>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul class="grid gap-3">
          <li v-for="item in items" :key="item.id" class="grid gap-1" data-testid="upload-item">
            <div class="flex items-center gap-3 text-sm">
              <span class="min-w-0 flex-1 truncate" :title="item.name">{{ item.name }}</span>
              <span class="num text-xs text-muted-foreground">{{ formatBytes(item.size) }}</span>
              <span v-if="item.phase === 'uploading'" class="num w-10 text-right text-xs">{{ Math.round(item.progress * 100) }}%</span>
              <span v-else-if="item.phase === 'checking'" class="text-xs text-muted-foreground">checking…</span>
              <DocumentStatusBadge v-if="item.phase === 'done'" :status="item.status" :reason="item.failureReason" />
            </div>
            <div v-if="item.phase === 'uploading' || item.phase === 'waiting'" class="h-1 overflow-hidden rounded bg-muted">
              <div class="h-full bg-primary transition-[width]" :style="{ width: `${item.progress * 100}%` }" />
            </div>
            <p v-if="item.failureReason" class="text-xs text-destructive">{{ item.failureReason }}</p>
          </li>
        </ul>
      </CardContent>
    </Card>
  </div>
</template>
