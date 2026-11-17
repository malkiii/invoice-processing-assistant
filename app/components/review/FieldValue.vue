<script setup lang="ts">
import { RotateCcw } from '@lucide/vue'
import type { Field } from '~~/server/domain/template/fields'

/**
 * One scalar Field, editable inline. Commits on blur or Enter; an edited Field is marked and can
 * be reverted to its Raw Value.
 */
const props = defineProps<{
  field: Field
  path: string
  value: unknown
  raw: unknown
  corrected: boolean
  failures: string[]
  disabled?: boolean
  compact?: boolean
}>()
const emit = defineEmits<{ correct: [path: string, value: unknown]; revert: [path: string] }>()

function display(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const money = computed(() => (props.value ?? {}) as { amount?: number | null; currency?: string | null })

function same(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

function commit(next: unknown) {
  if (!same(next, props.value)) emit('correct', props.path, next)
}

function commitText(event: Event) {
  const text = (event.target as HTMLInputElement).value
  if (props.field.type === 'number') {
    if (text.trim() === '') return commit(null)
    const n = Number(text.replace(/\s/g, '').replace(',', '.'))
    if (Number.isFinite(n)) return commit(n)
    ;(event.target as HTMLInputElement).value = display(props.value)
    return
  }
  commit(text === '' ? null : text)
}

function commitMoney(part: 'amount' | 'currency', event: Event) {
  const text = (event.target as HTMLInputElement).value.trim()
  const amount = part === 'amount' ? (text === '' ? null : Number(text.replace(',', '.'))) : (money.value.amount ?? null)
  const currency = part === 'currency' ? (text === '' ? null : text.toUpperCase()) : (money.value.currency ?? null)
  if (amount !== null && !Number.isFinite(amount)) return
  commit({ amount, currency })
}

const inputClass = computed(() => [
  'w-full min-w-0 rounded-md border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring',
  props.compact ? 'h-8' : 'h-9',
  props.corrected ? 'border-primary' : '',
  props.failures.length ? 'border-destructive' : '',
  props.field.type === 'number' || props.field.type === 'money' || props.field.type === 'date' ? 'num' : '',
])
</script>

<template>
  <div class="grid gap-1">
    <div class="flex items-center gap-1">
      <select
        v-if="field.type === 'enum'"
        :value="display(value)"
        :class="inputClass"
        :disabled="disabled"
        :aria-label="field.label"
        @change="commit(($event.target as HTMLSelectElement).value || null)"
      >
        <option value="">—</option>
        <option v-for="c in ('choices' in field ? field.choices : [])" :key="c" :value="c">{{ c }}</option>
      </select>
      <select
        v-else-if="field.type === 'boolean'"
        :value="value == null ? '' : String(value)"
        :class="inputClass"
        :disabled="disabled"
        :aria-label="field.label"
        @change="commit(({ true: true, false: false } as Record<string, boolean>)[($event.target as HTMLSelectElement).value] ?? null)"
      >
        <option value="">—</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
      <template v-else-if="field.type === 'money'">
        <input
          :value="display(money.amount)"
          inputmode="decimal"
          :class="inputClass"
          :disabled="disabled"
          :aria-label="`${field.label} amount`"
          @change="commitMoney('amount', $event)"
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        >
        <input
          :value="display(money.currency)"
          maxlength="3"
          :class="[inputClass, 'w-16 shrink-0 uppercase']"
          :disabled="disabled"
          :aria-label="`${field.label} currency`"
          @change="commitMoney('currency', $event)"
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        >
      </template>
      <input
        v-else
        :value="display(value)"
        :type="field.type === 'date' ? 'date' : 'text'"
        :inputmode="field.type === 'number' ? 'decimal' : undefined"
        :class="inputClass"
        :disabled="disabled"
        :aria-label="field.label"
        @change="commitText"
        @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
      >
      <button
        v-if="corrected && !disabled"
        type="button"
        class="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
        :title="`Revert to the extracted value: ${display(raw) || '(empty)'}`"
        :aria-label="`Revert ${field.label}`"
        @click="emit('revert', path)"
      >
        <RotateCcw class="size-3.5" />
      </button>
    </div>
    <p v-if="corrected && !compact" class="text-xs text-primary">Edited · extracted: <span class="num">{{ display(raw) || '(empty)' }}</span></p>
    <p v-for="f in failures" :key="f" class="text-xs text-destructive" role="note">{{ f }}</p>
  </div>
</template>
