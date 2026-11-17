<script setup lang="ts">
import { Badge } from '@/components/ui/badge'

const props = defineProps<{ status: string; reason?: string | null }>()

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
  <Badge :variant="variant" :title="reason ?? undefined" data-testid="document-status">{{ status }}</Badge>
</template>
