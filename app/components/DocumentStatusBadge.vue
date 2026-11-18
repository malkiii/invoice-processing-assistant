<script setup lang="ts">
import { Loader2 } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'

const props = defineProps<{ status: string; reason?: string | null }>()

/** Statuses where work is still happening: spinner while active, a pulsing dot while waiting. */
const ACTIVE = new Set(['uploading', 'fetching', 'processing'])
const WAITING = new Set(['queued'])

const variant = computed(() => {
  switch (props.status) {
    case 'failed':
      return 'destructive' as const
    case 'extracted':
      return 'default' as const
    case 'queued':
    case 'processing':
      return 'secondary' as const
    default:
      return 'outline' as const
  }
})
</script>

<template>
  <Badge :variant="variant" :title="reason ?? undefined" :aria-busy="ACTIVE.has(status) || WAITING.has(status) || undefined" data-testid="document-status">
    <Loader2 v-if="ACTIVE.has(status)" class="animate-spin" aria-hidden="true" />
    <span v-else-if="WAITING.has(status)" class="size-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />
    {{ status }}
  </Badge>
</template>
