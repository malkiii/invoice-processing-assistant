<script setup lang="ts">
// Google Drive and Dropbox tabs on the Intake page (ticket 12). Hidden when no source is enabled.
import { Cloud } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { SourceKind, SourceOption, StartedSourceBatch } from '~/composables/useSourcePickers'

const { data: sources } = await useFetch<SourceOption[]>('/api/sources', { default: () => [] })
const enabled = computed(() => sources.value.filter((s) => s.enabled))
const usable = (s: SourceOption) => s.connection?.status === 'ok'

const busy = ref<SourceKind | null>(null)
const errors = ref<Partial<Record<SourceKind, string>>>({})
const batches = ref<Partial<Record<SourceKind, StartedSourceBatch>>>({})

// Live status for the Batches started from each source.
useBatchEvents(() => Object.values(batches.value).map((b) => b?.batchId), {
  onChange: (change) => {
    for (const b of Object.values(batches.value)) {
      const doc = b?.documents.find((d) => d.id === change.documentId)
      if (doc) {
        doc.status = change.status
        doc.failureReason = change.failureReason
      }
    }
  },
})

onMounted(() => {
  const dropbox = enabled.value.find((s) => s.kind === 'dropbox' && usable(s))
  if (dropbox) prepareDropbox(dropbox).catch((err: Error) => (errors.value.dropbox = err.message))
})

async function pick(source: SourceOption) {
  errors.value[source.kind] = undefined
  try {
    // The Chooser opens a popup, so it is opened before anything is awaited.
    const picking = source.kind === 'dropbox' ? chooseFromDropbox() : pickFromGoogleDrive(source)
    busy.value = source.kind
    const files = await picking
    if (files.length === 0) return
    batches.value[source.kind] = await startSourceBatch(source.kind, files)
  } catch (err: any) {
    errors.value[source.kind] = err?.data?.statusMessage ?? err?.message ?? `Could not add files from ${source.label}.`
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <Card v-if="enabled.length">
    <CardHeader>
      <CardTitle class="flex items-center gap-2"><Cloud class="size-4" /> Add from cloud storage</CardTitle>
      <CardDescription>
        Pick files from a connected Google Drive or Dropbox. The server downloads them; each pick creates one Batch.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <Tabs :default-value="enabled[0]!.kind" class="gap-4">
        <TabsList>
          <TabsTrigger v-for="s in enabled" :key="s.kind" :value="s.kind" type="button">{{ s.label }}</TabsTrigger>
        </TabsList>
        <TabsContent v-for="s in enabled" :key="s.kind" :value="s.kind" class="grid gap-3">
          <template v-if="usable(s)">
            <p class="text-sm text-muted-foreground">Connected as {{ s.connection!.accountLabel }}.</p>
            <div class="flex flex-wrap items-center gap-3">
              <Button :disabled="busy !== null" :data-testid="`pick-${s.kind}`" @click="pick(s)">
                {{ busy === s.kind ? 'Adding…' : `Choose files from ${s.label}` }}
              </Button>
              <NuxtLink v-if="batches[s.kind]" :to="`/app/batches/${batches[s.kind]!.batchId}`" class="text-sm underline">
                View Batch
              </NuxtLink>
            </div>
          </template>
          <p v-else class="text-sm text-muted-foreground">
            <template v-if="s.connection">{{ s.connection.statusMessage }}</template>
            <template v-else>{{ s.label }} is not connected.</template>
            <NuxtLink to="/app/settings/sources" class="underline">
              {{ s.connection ? 'Reconnect' : 'Connect it' }} in Settings
            </NuxtLink>
          </p>
          <FormError :message="errors[s.kind] ?? null" />
          <ul v-if="batches[s.kind]" class="grid gap-2">
            <li v-for="d in batches[s.kind]!.documents" :key="d.id" class="grid gap-1" data-testid="source-item">
              <div class="flex items-center gap-3 text-sm">
                <span class="min-w-0 flex-1 truncate" :title="d.name">{{ d.name }}</span>
                <DocumentStatusBadge :status="d.status" :reason="d.failureReason" />
              </div>
              <p v-if="d.failureReason" class="text-xs text-destructive">{{ d.failureReason }}</p>
            </li>
          </ul>
        </TabsContent>
      </Tabs>
    </CardContent>
  </Card>
</template>
