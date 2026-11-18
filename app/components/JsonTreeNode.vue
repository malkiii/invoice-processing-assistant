<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import type { Ref } from 'vue'

/**
 * One line (or block) of a JsonTree. Objects and arrays fold behind a chevron; scalars are coloured
 * by type. Expand/collapse-all requests arrive through the injected `json-tree-control`.
 */
const props = defineProps<{ value: unknown; name?: string; depth: number; last: boolean }>()

const control = inject<Ref<{ open: boolean; tick: number }> | null>('json-tree-control', null)

const isArray = computed(() => Array.isArray(props.value))
const isContainer = computed(() => props.value !== null && typeof props.value === 'object')
const foldable = computed(() => isContainer.value && entries.value.length > 0)
const entries = computed<[string | undefined, unknown][]>(() => {
  if (Array.isArray(props.value)) return props.value.map((v) => [undefined, v])
  if (isContainer.value) return Object.entries(props.value as Record<string, unknown>)
  return []
})
const brackets = computed(() => (isArray.value ? ['[', ']'] : ['{', '}']))
const summary = computed(() => {
  const n = entries.value.length
  return isArray.value ? `${n} item${n === 1 ? '' : 's'}` : `${n} key${n === 1 ? '' : 's'}`
})

const open = ref(props.depth < 4)
watch(
  () => control?.value.tick,
  () => {
    if (control) open.value = control.value.open
  },
)

const scalarClass = computed(() => {
  const v = props.value
  if (v === null) return 'text-muted-foreground italic'
  switch (typeof v) {
    case 'string':
      return 'text-emerald-700 dark:text-emerald-400'
    case 'number':
      return 'text-amber-700 dark:text-amber-300'
    case 'boolean':
      return 'text-violet-700 dark:text-violet-400'
    default:
      return ''
  }
})
const scalarText = computed(() => JSON.stringify(props.value))
</script>

<template>
  <div>
    <div class="flex items-start rounded-sm hover:bg-foreground/5">
      <button
        v-if="foldable"
        type="button"
        class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        :aria-expanded="open"
        :aria-label="open ? `Collapse ${name ?? 'item'}` : `Expand ${name ?? 'item'}`"
        @click="open = !open"
      >
        <ChevronRight class="size-3.5 transition-transform" :class="open && 'rotate-90'" />
      </button>
      <span v-else class="w-4 shrink-0" />
      <span class="min-w-0 break-words whitespace-pre-wrap">
        <template v-if="name !== undefined">
          <span
            class="text-sky-700 dark:text-sky-400"
            :class="foldable && 'cursor-pointer hover:underline'"
            @click="foldable && (open = !open)"
            >"{{ name }}"</span
          ><span class="text-muted-foreground">: </span>
        </template>
        <template v-if="isContainer">
          <span class="text-muted-foreground">{{ brackets[0] }}</span>
          <template v-if="!entries.length"
            ><span class="text-muted-foreground">{{ brackets[1] }}</span></template
          >
          <template v-else-if="!open">
            <button
              type="button"
              class="mx-1 rounded bg-muted px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
              @click="open = true"
            >
              {{ summary }}</button
            ><span class="text-muted-foreground">{{ brackets[1] }}</span>
          </template>
          <span v-if="(!open || !entries.length) && !last" class="text-muted-foreground">,</span>
        </template>
        <template v-else>
          <span :class="scalarClass">{{ scalarText }}</span
          ><span v-if="!last" class="text-muted-foreground">,</span>
        </template>
      </span>
    </div>
    <template v-if="foldable && open">
      <div class="ml-[7px] border-l border-border pl-[9px]">
        <JsonTreeNode
          v-for="([key, child], i) in entries"
          :key="key ?? i"
          :name="key"
          :value="child"
          :depth="depth + 1"
          :last="i === entries.length - 1"
        />
      </div>
      <div class="pl-4 text-muted-foreground">
        {{ brackets[1] }}<span v-if="!last">,</span>
      </div>
    </template>
  </div>
</template>
