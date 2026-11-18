<script setup lang="ts">
import { FilePlus, FolderPlus, Link as LinkIcon, UploadCloud } from '@lucide/vue'
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

// --- URL intake ---
interface StartedUrlBatch {
  batchId: string
  documents: { id: string; name: string; status: string; failureReason: string | null }[]
}
const urlText = ref('')
const urlBusy = ref(false)
const urlError = ref<string | null>(null)
const urlBatch = ref<StartedUrlBatch | null>(null)
const urlLines = computed(() => urlText.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))

async function submitUrls() {
  if (urlLines.value.length === 0) return
  urlBusy.value = true
  urlError.value = null
  try {
    urlBatch.value = await $fetch<StartedUrlBatch>('/api/url-batches', {
      method: 'POST',
      body: { urls: urlLines.value },
    })
    urlText.value = ''
  } catch (err: any) {
    urlError.value = err?.data?.statusMessage ?? err?.message ?? 'Could not import the URLs.'
  } finally {
    urlBusy.value = false
  }
}

// Live status for the Batches started here, so queued Documents move on without a reload.
useBatchEvents(() => [batchId.value, urlBatch.value?.batchId], {
  onChange: (change) => {
    const item = items.value.find((i) => i.id === change.documentId)
    if (item) {
      item.status = change.status
      item.failureReason = change.failureReason
    }
    const doc = urlBatch.value?.documents.find((d) => d.id === change.documentId)
    if (doc) {
      doc.status = change.status
      doc.failureReason = change.failureReason
    }
  },
})

const summary = computed(() => {
  const done = items.value.filter((i) => i.phase === 'done')
  return {
    done: done.length,
    queued: done.filter((i) => i.status === 'queued' || i.status === 'processing').length,
    extracted: done.filter((i) => i.status === 'extracted').length,
    failed: done.filter((i) => i.status === 'failed').length,
  }
})
</script>

<template>
  <div class="grid max-w-4xl grid-cols-1 gap-6">
    <div>
      <h1 class="text-2xl font-semibold">Intake</h1>
      <p class="text-sm text-muted-foreground">
        Add Documents from your computer, from URLs or from a connected Google Drive or Dropbox: PDF, DOCX, PNG, JPEG, WEBP or HTML. Each drop, pick or URL
        submission creates one Batch.
      </p>
    </div>

    <div
      class="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors sm:p-10"
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
          <span class="num">{{ summary.queued }}</span> in progress ·
          <span class="num">{{ summary.extracted }}</span> extracted ·
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

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2"><LinkIcon class="size-4" /> Import from URLs</CardTitle>
        <CardDescription>
          One https:// URL per line. Each URL is downloaded by the server; a web page is kept as an HTML Document
          and its links are not followed. Each submission creates one Batch.
        </CardDescription>
      </CardHeader>
      <CardContent class="grid gap-3">
        <textarea
          v-model="urlText"
          rows="5"
          spellcheck="false"
          placeholder="https://example.com/invoices/2026-03.pdf"
          class="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          data-testid="url-input"
        />
        <div class="flex items-center gap-3">
          <Button :disabled="urlBusy || urlLines.length === 0" data-testid="url-submit" @click="submitUrls">
            Import <span v-if="urlLines.length" class="num">{{ urlLines.length }}</span>
            {{ urlLines.length === 1 ? 'URL' : 'URLs' }}
          </Button>
          <NuxtLink v-if="urlBatch" :to="`/app/batches/${urlBatch.batchId}`" class="text-sm underline">
            View Batch
          </NuxtLink>
        </div>
        <FormError :message="urlError" />
        <ul v-if="urlBatch" class="grid gap-2">
          <li v-for="d in urlBatch.documents" :key="d.id" class="grid gap-1" data-testid="url-item">
            <div class="flex items-center gap-3 text-sm">
              <span class="min-w-0 flex-1 truncate font-mono" :title="d.name">{{ d.name }}</span>
              <DocumentStatusBadge :status="d.status" :reason="d.failureReason" />
            </div>
            <p v-if="d.failureReason" class="text-xs text-destructive">{{ d.failureReason }}</p>
          </li>
        </ul>
      </CardContent>
    </Card>

    <IntakeCloudSources />
  </div>
</template>
