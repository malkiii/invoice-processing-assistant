<script setup lang="ts">
import { Badge } from '@/components/ui/badge'

/** An Invoice's Check status: clean, the failed Checks, or not checked yet. */
const props = defineProps<{ status: 'unchecked' | 'clean' | 'failing'; failed?: string[] }>()

const title = computed(() => (props.failed?.length ? props.failed.join('\n') : undefined))
</script>

<template>
  <Badge v-if="status === 'failing'" variant="destructive" :title="title" data-testid="check-status">
    {{ failed?.length ?? 0 }} failed {{ (failed?.length ?? 0) === 1 ? 'Check' : 'Checks' }}
  </Badge>
  <Badge v-else-if="status === 'clean'" variant="default" data-testid="check-status">Checks clean</Badge>
  <Badge v-else variant="outline" data-testid="check-status">Not checked</Badge>
</template>
