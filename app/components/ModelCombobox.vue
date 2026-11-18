<script setup lang="ts">
import { Check, ChevronsUpDown, X } from '@lucide/vue'
import { ComboboxAnchor, ComboboxInput, ComboboxTrigger } from 'reka-ui'
import {
  Combobox,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  ComboboxViewport,
} from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'

/**
 * Picks a model id. With a model list from the provider, only those models can be chosen;
 * without one (`models` is null) it falls back to typing the id.
 */
defineProps<{
  models: string[] | null
  id?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  /** Offer a clear button; an empty value means "use the default". */
  clearable?: boolean
  /** Render the list inside the parent, needed inside a modal <dialog> (top layer). */
  disablePortal?: boolean
}>()
const model = defineModel<string>({ required: true })
const emit = defineEmits<{ change: [value: string] }>()

function pick(value: unknown) {
  const next = typeof value === 'string' ? value : ''
  if (next === model.value) return
  model.value = next
  emit('change', next)
}

const inputClass =
  'placeholder:text-muted-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent py-1 pl-3 pr-14 font-mono text-sm shadow-xs outline-none transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3'
</script>

<template>
  <Input
    v-if="!models"
    :id="id"
    :model-value="model"
    :placeholder="placeholder"
    :disabled="disabled"
    :required="required"
    class="font-mono"
    @update:model-value="model = String($event)"
    @change="emit('change', model)"
  />
  <Combobox
    v-else
    :model-value="model || undefined"
    :disabled="disabled"
    open-on-click
    @update:model-value="pick"
  >
    <ComboboxAnchor class="relative w-full">
      <ComboboxInput
        :id="id"
        :class="inputClass"
        :placeholder="placeholder"
        :required="required"
        :display-value="(value: unknown) => (typeof value === 'string' ? value : '')"
      />
      <button
        v-if="clearable && model && !disabled"
        type="button"
        aria-label="Clear model"
        class="absolute inset-y-0 right-7 flex items-center px-1 text-muted-foreground hover:text-foreground"
        @click="pick('')"
      >
        <X class="size-3.5" />
      </button>
      <ComboboxTrigger class="absolute inset-y-0 right-0 flex items-center px-2" aria-label="Show models">
        <ChevronsUpDown class="size-4 opacity-50" />
      </ComboboxTrigger>
    </ComboboxAnchor>
    <ComboboxList :disable-portal="disablePortal" align="start" class="w-(--reka-combobox-trigger-width)">
      <ComboboxViewport class="max-h-64 overflow-y-auto p-1">
        <ComboboxEmpty class="py-4 text-center text-sm text-muted-foreground">No matching model.</ComboboxEmpty>
        <ComboboxItem v-for="m in models" :key="m" :value="m" class="font-mono text-xs">
          <span class="truncate">{{ m }}</span>
          <ComboboxItemIndicator class="ml-auto"><Check class="size-4" /></ComboboxItemIndicator>
        </ComboboxItem>
      </ComboboxViewport>
    </ComboboxList>
  </Combobox>
</template>
