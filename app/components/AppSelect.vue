<script setup lang="ts" generic="T extends string">
import type { HTMLAttributes } from 'vue'
import { cn } from 'cn'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/**
 * A themed dropdown over a list of string options. Unlike the reka-ui primitive it accepts an
 * empty-string option ("All", "None"), which reka reserves for "no value".
 */
const props = defineProps<{
  options: { value: T; label: string }[]
  id?: string
  placeholder?: string
  disabled?: boolean
  size?: 'sm' | 'default'
  ariaLabel?: string
  /** Render the list inside the parent, needed inside a modal <dialog> (top layer). */
  disablePortal?: boolean
  class?: HTMLAttributes['class']
}>()
const model = defineModel<T>({ required: true })
const emit = defineEmits<{ change: [value: T] }>()

const NONE = '__none__'
const encode = (value: string) => (value === '' ? NONE : value)

const inner = computed({
  get: () => encode(model.value),
  set: (value: string) => {
    const decoded = (value === NONE ? '' : value) as T
    if (decoded === model.value) return
    model.value = decoded
    emit('change', decoded)
  },
})
</script>

<template>
  <Select v-model="inner" :disabled="disabled">
    <SelectTrigger :id="id" :size="size" :aria-label="ariaLabel" :class="cn('w-full', props.class)">
      <SelectValue :placeholder="placeholder" />
    </SelectTrigger>
    <SelectContent :disable-portal="disablePortal">
      <SelectItem v-for="option in options" :key="option.value" :value="encode(option.value)">
        {{ option.label }}
      </SelectItem>
    </SelectContent>
  </Select>
</template>
