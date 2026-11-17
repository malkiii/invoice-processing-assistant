<script setup lang="ts">
import { AlertTriangle } from '@lucide/vue'

// A Provider Connection is marked broken when the provider rejects its key (401);
// that User's queued Extractions wait until it is fixed.
const route = useRoute()
const { data: connections, refresh } = await useFetch<{ id: string; name: string; status: string }[]>(
  '/api/providers',
  { key: 'provider-broken-banner', default: () => [] },
)
watch(() => route.fullPath, () => refresh())
const broken = computed(() => connections.value.filter((c) => c.status === 'broken'))
</script>

<template>
  <div
    v-if="broken.length"
    role="alert"
    class="flex items-center gap-2 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
  >
    <AlertTriangle class="size-4 shrink-0" />
    <span>
      {{ broken.map((c) => c.name).join(', ') }} stopped working: the provider rejected the API key.
      Extractions using it are paused.
    </span>
    <NuxtLink to="/app/settings/providers" class="ml-auto font-medium underline">Fix it</NuxtLink>
  </div>
</template>
