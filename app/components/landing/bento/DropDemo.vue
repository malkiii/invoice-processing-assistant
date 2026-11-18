<script setup lang="ts">
import { CircleAlert, CircleCheck, FileText, LoaderCircle, Upload } from '@lucide/vue'

/**
 * A drop zone that accepts real files but never uploads them: it reads names and sizes
 * locally and plays the Batch lifecycle, including the 25 MB limit.
 */
type Status = 'queued' | 'extracting' | 'extracted' | 'failed'
interface DemoFile { id: number; name: string; size: number; status: Status; invoices: number }

const LIMIT = 25 * 1024 * 1024
const files = ref<DemoFile[]>([])
const over = ref(false)
const input = ref<HTMLInputElement>()
const timers = new Set<ReturnType<typeof setTimeout>>()
let nextId = 1

function later(ms: number, fn: () => void) {
  const t = setTimeout(() => { timers.delete(t); fn() }, ms)
  timers.add(t)
}
onBeforeUnmount(() => timers.forEach(clearTimeout))

function add(list: { name: string; size: number }[]) {
  list.slice(0, 5).forEach((f, i) => {
    const file = reactive<DemoFile>({ id: nextId++, name: f.name, size: f.size, status: 'queued', invoices: 1 + (f.name.length % 3) })
    files.value = [file, ...files.value].slice(0, 5)
    later(400 + i * 350, () => {
      if (file.size > LIMIT) { file.status = 'failed'; return }
      file.status = 'extracting'
      later(1600 + Math.random() * 900, () => (file.status = 'extracted'))
    })
  })
}

function onDrop(e: DragEvent) {
  over.value = false
  const dropped = [...(e.dataTransfer?.files ?? [])].map((f) => ({ name: f.name, size: f.size }))
  if (dropped.length) add(dropped)
}
function onPick(e: Event) {
  const picked = [...((e.target as HTMLInputElement).files ?? [])].map((f) => ({ name: f.name, size: f.size }))
  add(picked)
  ;(e.target as HTMLInputElement).value = ''
}
function samples() {
  add([
    { name: 'northwind-0418.pdf', size: 1_240_000 },
    { name: 'taxi-receipt.jpg', size: 840_000 },
    { name: 'q4-supplies.docx', size: 310_000 },
    { name: 'scanned-archive-2019.pdf', size: 48_000_000 },
  ])
}
const size = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`)
</script>

<template>
  <div class="flex h-full flex-col gap-3">
    <div
      class="relative flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-center transition-all duration-300"
      :class="over ? 'scale-[1.02] border-primary bg-primary/10' : 'border-border bg-background/40'"
      @dragover.prevent="over = true"
      @dragleave="over = false"
      @drop.prevent="onDrop"
    >
      <Upload class="size-6 transition-transform duration-300" :class="over ? '-translate-y-1 text-primary' : 'text-muted-foreground'" />
      <p class="text-sm">Drop real files here, or
        <button type="button" class="text-primary underline-offset-4 hover:underline" @click="input?.click()">browse</button>
      </p>
      <p class="text-xs text-muted-foreground">Nothing is uploaded in this demo.</p>
      <button type="button" class="num mt-1 rounded-full border border-primary/40 px-3 py-1 text-xs text-primary transition-colors hover:bg-primary hover:text-primary-foreground" @click="samples">
        Try sample files
      </button>
      <input ref="input" type="file" multiple class="hidden" @change="onPick">
    </div>

    <TransitionGroup tag="ul" name="b-file" class="relative flex flex-col gap-1.5">
      <li v-for="f in files" :key="f.id" class="flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-background/60 px-3 py-2 text-xs">
        <FileText class="size-4 shrink-0 text-muted-foreground" />
        <div class="min-w-0 flex-1">
          <div class="flex justify-between gap-2">
            <span class="num truncate">{{ f.name }}</span>
            <span class="num shrink-0 text-muted-foreground">{{ size(f.size) }}</span>
          </div>
          <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-border">
            <div
              class="h-full rounded-full transition-[width] ease-out"
              :class="[f.status === 'failed' ? 'bg-destructive' : 'bg-primary', f.status === 'extracting' ? 'duration-[2000ms]' : 'duration-300']"
              :style="{ width: f.status === 'queued' ? '6%' : f.status === 'extracting' ? '85%' : '100%' }"
            />
          </div>
        </div>
        <span class="num flex w-28 shrink-0 items-center justify-end gap-1">
          <template v-if="f.status === 'queued'"><span class="text-muted-foreground">queued</span></template>
          <template v-else-if="f.status === 'extracting'"><LoaderCircle class="size-3.5 animate-spin text-primary" /> extracting</template>
          <template v-else-if="f.status === 'extracted'"><CircleCheck class="size-3.5 text-primary" /> {{ f.invoices }} Invoice{{ f.invoices > 1 ? 's' : '' }}</template>
          <template v-else><CircleAlert class="size-3.5 text-destructive" /><span class="text-destructive">over 25 MB</span></template>
        </span>
      </li>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.b-file-enter-active, .b-file-leave-active, .b-file-move { transition: all 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.2); }
.b-file-enter-from { opacity: 0; transform: translateY(-14px) scale(0.96); }
.b-file-leave-to { opacity: 0; transform: translateX(30px); }
.b-file-leave-active { position: absolute; width: 100%; }
@media (prefers-reduced-motion: reduce) {
  .b-file-enter-active, .b-file-leave-active, .b-file-move { transition: none; }
}
</style>
