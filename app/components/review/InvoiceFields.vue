<script setup lang="ts">
import type { CheckResult } from '~~/server/domain/checks'
import { isGroupField, type Field } from '~~/server/domain/template/fields'

/**
 * The Fields of one Invoice, rendered from its Extraction's Template Snapshot: scalars, groups and
 * list tables, each editable. Failed Checks appear next to the Fields they concern.
 */
const props = defineProps<{
  fields: Field[]
  values: Record<string, unknown>
  rawValues: Record<string, unknown>
  correctedPaths: string[]
  checkResults: CheckResult[] | null
  disabled?: boolean
}>()
const emit = defineEmits<{ correct: [path: string, value: unknown]; revert: [path: string] }>()

const corrected = computed(() => new Set(props.correctedPaths))

/** Failed Check messages per Field path (`total`, `vendor.name`, `line_items[2].amount`, `line_items`). */
const failuresByPath = computed(() => {
  const map = new Map<string, string[]>()
  for (const r of props.checkResults ?? []) {
    if (r.status !== 'fail') continue
    for (const path of r.fields) map.set(path, [...(map.get(path) ?? []), r.message])
  }
  return map
})

function failures(path: string) {
  return failuresByPath.value.get(path) ?? []
}

function at(values: Record<string, unknown>, key: string, child?: string, index?: number): unknown {
  let v: unknown = values[key]
  if (index !== undefined) v = Array.isArray(v) ? v[index] : undefined
  if (child !== undefined) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[child] : undefined
  return v
}

function items(key: string): unknown[] {
  const v = props.values[key]
  return Array.isArray(v) ? v : []
}

/** Failures on a list cell path, or on the list or one of its items as a whole. */
function listFailures(key: string) {
  const out: string[] = []
  for (const [path, messages] of failuresByPath.value) {
    if (path === key || /^\w+\[\d+\]$/.test(path) && path.startsWith(`${key}[`)) out.push(...messages)
  }
  return [...new Set(out)]
}

const onCorrect = (path: string, value: unknown) => emit('correct', path, value)
const onRevert = (path: string) => emit('revert', path)
</script>

<template>
  <div class="grid gap-5">
    <template v-for="field in fields" :key="field.key">
      <div v-if="!isGroupField(field)" class="grid gap-1 sm:grid-cols-[10rem_1fr] sm:items-start sm:gap-3">
        <label class="pt-2 text-sm text-muted-foreground" :title="field.description">
          {{ field.label }}<span v-if="field.required" class="text-destructive" aria-hidden="true"> *</span>
        </label>
        <ReviewFieldValue
          :field="field"
          :path="field.key"
          :value="values[field.key]"
          :raw="rawValues[field.key]"
          :corrected="corrected.has(field.key)"
          :failures="failures(field.key)"
          :disabled="disabled"
          @correct="onCorrect"
          @revert="onRevert"
        />
      </div>

      <fieldset v-else-if="field.type === 'object'" class="grid gap-2 rounded-lg border p-3">
        <legend class="px-1 text-sm font-medium" :title="field.description">{{ field.label }}</legend>
        <div v-for="child in field.fields" :key="child.key" class="grid gap-1 sm:grid-cols-[9rem_1fr] sm:items-start sm:gap-3">
          <label class="pt-2 text-sm text-muted-foreground" :title="child.description">{{ child.label }}</label>
          <ReviewFieldValue
            :field="child"
            :path="`${field.key}.${child.key}`"
            :value="at(values, field.key, child.key)"
            :raw="at(rawValues, field.key, child.key)"
            :corrected="corrected.has(`${field.key}.${child.key}`)"
            :failures="failures(`${field.key}.${child.key}`)"
            :disabled="disabled"
            @correct="onCorrect"
            @revert="onRevert"
          />
        </div>
      </fieldset>

      <section v-else class="grid gap-2">
        <h3 class="text-sm font-medium" :title="field.description">
          {{ field.label }} <span class="num text-muted-foreground">{{ items(field.key).length }}</span>
        </h3>
        <p v-for="f in listFailures(field.key)" :key="f" class="text-xs text-destructive" role="note">{{ f }}</p>
        <p v-if="!items(field.key).length" class="text-sm text-muted-foreground">None extracted.</p>
        <div v-else class="overflow-x-auto rounded-lg border">
          <table class="w-full text-sm">
            <thead class="text-left text-muted-foreground">
              <tr>
                <th v-for="child in field.fields" :key="child.key" class="px-2 py-1.5 font-medium" :title="child.description">{{ child.label }}</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              <tr v-for="(_, index) in items(field.key)" :key="index">
                <td v-for="child in field.fields" :key="child.key" class="min-w-24 px-1.5 py-1 align-top">
                  <ReviewFieldValue
                    :field="child"
                    :path="`${field.key}[${index}].${child.key}`"
                    :value="at(values, field.key, child.key, index)"
                    :raw="at(rawValues, field.key, child.key, index)"
                    :corrected="corrected.has(`${field.key}[${index}].${child.key}`)"
                    :failures="failures(`${field.key}[${index}].${child.key}`)"
                    :disabled="disabled"
                    compact
                    @correct="onCorrect"
                    @revert="onRevert"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
