<script setup lang="ts">
import { Check, ChevronsDownUp, ChevronsUpDown, Copy } from '@lucide/vue'
import { Button } from '@/components/ui/button'

/** Read-only, colour-coded JSON viewer with foldable objects/arrays and expand/collapse-all. */
defineOptions({ inheritAttrs: false })
const props = defineProps<{ value: unknown }>()

const control = ref({ open: true, tick: 0 })
provide('json-tree-control', control)

function setAll(open: boolean) {
  control.value = { open, tick: control.value.tick + 1 }
}

const copied = ref(false)
async function copy() {
  await navigator.clipboard.writeText(JSON.stringify(props.value, null, 2))
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <div class="overflow-hidden rounded-md border bg-muted/40">
    <div class="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
      <Button type="button" variant="ghost" size="sm" class="h-7 text-xs" @click="setAll(true)">
        <ChevronsUpDown class="size-3.5" /> Expand all
      </Button>
      <Button type="button" variant="ghost" size="sm" class="h-7 text-xs" @click="setAll(false)">
        <ChevronsDownUp class="size-3.5" /> Collapse all
      </Button>
      <Button type="button" variant="ghost" size="sm" class="ml-auto h-7 text-xs" @click="copy">
        <component :is="copied ? Check : Copy" class="size-3.5" /> {{ copied ? 'Copied' : 'Copy' }}
      </Button>
    </div>
    <div class="max-h-[70vh] overflow-auto p-3 font-mono text-xs leading-5" v-bind="$attrs">
      <JsonTreeNode :value="value" :depth="0" :last="true" />
    </div>
  </div>
</template>
