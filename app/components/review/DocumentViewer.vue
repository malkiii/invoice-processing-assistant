<script setup lang="ts">
/** The Document viewer: PDF and images natively, HTML and DOCX rendered in a fully sandboxed frame. */
const props = defineProps<{
  documentId: string
  name: string
  format: string | null
  mimeType: string | null
  fileUrl: string | null
}>()

const renderedUrl = computed(() => `/api/documents/${props.documentId}/rendered`)
</script>

<template>
  <div class="h-full min-h-[60svh] overflow-hidden rounded-lg border bg-card">
    <template v-if="fileUrl">
      <img v-if="mimeType?.startsWith('image/')" :src="fileUrl" :alt="name" class="mx-auto max-h-[85svh] object-contain">
      <iframe v-else-if="format === 'pdf'" :src="fileUrl" :title="name" class="h-[85svh] w-full" />
      <!-- HTML and Word Documents never run scripts or reach the app: fully sandboxed. -->
      <iframe v-else-if="format === 'html'" :src="fileUrl" :title="name" sandbox="" class="h-[85svh] w-full bg-white" />
      <iframe v-else-if="format === 'docx'" :src="renderedUrl" :title="name" sandbox="" class="h-[85svh] w-full bg-white" />
      <div v-else class="grid place-items-center gap-2 p-10 text-sm text-muted-foreground">
        <a :href="fileUrl" class="underline">Open the file</a>
      </div>
    </template>
    <p v-else class="p-10 text-center text-sm text-muted-foreground">No file to show.</p>
  </div>
</template>
