<script setup lang="ts">
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FIELD_TYPES, MAX_FIELD_DEPTH, SCALAR_FIELD_TYPES } from '~~/server/domain/template/fields'

/**
 * One level of the Field builder. Groups and lists render a nested list at depth 2, where only
 * scalar types are offered: the depth limit of two is enforced here and again on the server.
 */
const props = defineProps<{ fields: DraftField[]; depth: number; readonly?: boolean }>()

const fieldTypes = computed(() => (props.depth >= MAX_FIELD_DEPTH ? SCALAR_FIELD_TYPES : FIELD_TYPES))
const inputClass =
  'border-input w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 dark:bg-input/30 disabled:opacity-70'

const dragging = ref<number | null>(null)
const over = ref<number | null>(null)

function move(from: number, to: number) {
  if (from === to || to < 0 || to >= props.fields.length) return
  const [field] = props.fields.splice(from, 1)
  props.fields.splice(to, 0, field!)
}

function onDrop(index: number) {
  if (dragging.value !== null) move(dragging.value, index)
  dragging.value = null
  over.value = null
}

function add() {
  props.fields.push(newDraftField())
}

function onLabel(field: DraftField) {
  if (!field.keyEdited) field.key = keyFromLabel(field.label)
}

function onType(field: DraftField) {
  if ((field.type === 'object' || field.type === 'list') && field.fields.length === 0) field.fields.push(newDraftField())
  if (field.type === 'enum' && field.choices.length === 0) field.choices.push('')
}
</script>

<template>
  <div class="grid gap-3">
    <p v-if="fields.length === 0" class="text-sm text-muted-foreground">No Fields yet.</p>
    <div
      v-for="(field, index) in fields"
      :key="field.uid"
      class="grid gap-3 rounded-lg border bg-card p-3"
      :class="{ 'ring-2 ring-primary/50': over === index && dragging !== index, 'opacity-50': dragging === index }"
      data-testid="template-field"
      @dragover.prevent="over = index"
      @dragleave="over = over === index ? null : over"
      @drop.prevent="onDrop(index)"
    >
      <div class="flex items-start gap-2">
        <span
          v-if="!readonly"
          class="mt-2 cursor-grab text-muted-foreground"
          draggable="true"
          title="Drag to reorder"
          aria-hidden="true"
          @dragstart="dragging = index"
          @dragend="dragging = null; over = null"
        >
          <GripVertical class="size-4" />
        </span>
        <div class="grid flex-1 gap-2 sm:grid-cols-3">
          <label class="grid gap-1 text-xs text-muted-foreground">
            Label
            <Input v-model="field.label" :disabled="readonly" placeholder="Invoice number" @input="onLabel(field)" />
          </label>
          <label class="grid gap-1 text-xs text-muted-foreground">
            Key
            <Input
              v-model="field.key"
              :disabled="readonly"
              class="font-mono"
              placeholder="invoice_number"
              @input="field.keyEdited = true"
            />
          </label>
          <label class="grid gap-1 text-xs text-muted-foreground">
            Type
            <select v-model="field.type" :disabled="readonly" :class="inputClass" @change="onType(field)">
              <option v-for="t in fieldTypes" :key="t" :value="t">{{ FIELD_TYPE_LABELS[t] }}</option>
            </select>
          </label>
        </div>
        <div v-if="!readonly" class="flex shrink-0 flex-col">
          <Button type="button" variant="ghost" size="icon-xs" :disabled="index === 0" aria-label="Move up" @click="move(index, index - 1)">
            <ChevronUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            :disabled="index === fields.length - 1"
            aria-label="Move down"
            @click="move(index, index + 1)"
          >
            <ChevronDown />
          </Button>
          <Button type="button" variant="ghost" size="icon-xs" aria-label="Remove Field" @click="fields.splice(index, 1)">
            <Trash2 />
          </Button>
        </div>
      </div>

      <label class="grid gap-1 text-sm font-medium">
        Instruction for the model
        <textarea
          v-model="field.description"
          :disabled="readonly"
          rows="2"
          :class="inputClass"
          class="font-normal"
          placeholder="How to find this value on the invoice, and what to leave out."
        />
      </label>

      <div class="flex flex-wrap items-center gap-4 text-sm">
        <label class="flex items-center gap-2">
          <input v-model="field.required" type="checkbox" class="size-4 accent-primary" :disabled="readonly" />
          Required (flagged by a Check when missing)
        </label>
      </div>

      <div v-if="field.type === 'enum'" class="grid gap-2">
        <span class="text-xs text-muted-foreground">Choices</span>
        <div class="flex flex-wrap gap-2">
          <div v-for="(_, ci) in field.choices" :key="ci" class="flex items-center gap-1">
            <Input v-model="field.choices[ci]" :disabled="readonly" class="h-8 w-36" />
            <Button
              v-if="!readonly"
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Remove choice"
              @click="field.choices.splice(ci, 1)"
            >
              <X />
            </Button>
          </div>
          <Button v-if="!readonly" type="button" variant="outline" size="sm" @click="field.choices.push('')">Add choice</Button>
        </div>
      </div>

      <div v-if="field.type === 'object' || field.type === 'list'" class="grid gap-2 border-l-2 pl-3">
        <span class="text-xs text-muted-foreground">
          {{ field.type === 'list' ? 'Each item has' : 'Fields in this group' }} (scalar types only)
        </span>
        <TemplatesFieldList :fields="field.fields" :depth="depth + 1" :readonly="readonly" />
      </div>
    </div>
    <div v-if="!readonly">
      <Button type="button" variant="outline" size="sm" @click="add"><Plus /> Add Field</Button>
    </div>
  </div>
</template>
