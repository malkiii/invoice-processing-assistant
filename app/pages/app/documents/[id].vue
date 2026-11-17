<script setup lang="ts">
import { Trash2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'

definePageMeta({ layout: 'app', middleware: 'auth' })

const route = useRoute()
const id = route.params.id as string
const { data: doc, error } = await useFetch(`/api/documents/${id}`)
if (error.value?.statusCode === 404) throw createError({ statusCode: 404, statusMessage: 'Document not found' })
useHead({ title: () => doc.value?.name ?? 'Document' })

const deleting = ref(false)
async function remove() {
  if (!doc.value || !confirm(`Delete “${doc.value.name}” and its file? This cannot be undone.`)) return
  deleting.value = true
  try {
    await $fetch(`/api/documents/${id}`, { method: 'DELETE' })
    await navigateTo(`/app/batches/${doc.value.batchId}`)
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div v-if="doc" class="grid gap-4">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <NuxtLink :to="`/app/batches/${doc.batchId}`" class="text-sm text-muted-foreground underline">Batch</NuxtLink>
        <h1 class="truncate text-2xl font-semibold" :title="doc.name">{{ doc.name }}</h1>
        <div class="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <DocumentStatusBadge :status="doc.status" :reason="doc.failureReason" />
          <span class="uppercase">{{ doc.format ?? '—' }}</span>
          <span class="num">{{ formatBytes(doc.sizeBytes) }}</span>
          <span v-if="doc.pageCount" class="num">{{ doc.pageCount }} pages</span>
        </div>
        <p v-if="doc.failureReason" class="mt-2 text-sm text-destructive">{{ doc.failureReason }}</p>
      </div>
      <Button variant="destructive" :disabled="deleting" @click="remove">
        <Trash2 class="size-4" /> Delete
      </Button>
    </div>

    <div class="min-h-[70svh] overflow-hidden rounded-lg border bg-card">
      <template v-if="doc.fileUrl">
        <img v-if="doc.mimeType?.startsWith('image/')" :src="doc.fileUrl" :alt="doc.name" class="mx-auto max-h-[80svh] object-contain">
        <iframe v-else-if="doc.format === 'pdf'" :src="doc.fileUrl" :title="doc.name" class="h-[80svh] w-full" />
        <!-- HTML Documents never run scripts or reach the app: fully sandboxed. -->
        <iframe v-else-if="doc.format === 'html'" :src="doc.fileUrl" :title="doc.name" sandbox="" class="h-[80svh] w-full bg-white" />
        <div v-else class="grid place-items-center gap-2 p-10 text-sm text-muted-foreground">
          <p>This format is shown once the Document is extracted.</p>
          <a :href="doc.fileUrl" class="underline">Open the file</a>
        </div>
      </template>
      <p v-else class="p-10 text-center text-sm text-muted-foreground">No file to show.</p>
    </div>
  </div>
</template>
