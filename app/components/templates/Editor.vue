<script setup lang="ts">
import { z } from 'zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { compileTemplate, TemplateFieldError } from '~~/server/domain/template/compile'

/** Name, Field builder and a live JSON preview of the schema the model receives. */
const props = defineProps<{ fields: DraftField[]; readonly?: boolean }>()
const name = defineModel<string>('name', { required: true })

const preview = computed<{ json: string; error: string | null }>(() => {
  try {
    const schema = compileTemplate(toFields(props.fields))
    return { json: JSON.stringify(z.toJSONSchema(schema), null, 2), error: null }
  } catch (error) {
    if (error instanceof TemplateFieldError) return { json: '', error: error.message }
    return { json: '', error: 'The Fields cannot be compiled yet.' }
  }
})

defineExpose({ valid: computed(() => preview.value.error === null) })
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
    <div class="grid content-start gap-6">
      <div class="grid max-w-md gap-2">
        <Label for="template-name">Name</Label>
        <Input id="template-name" v-model="name" :disabled="readonly" maxlength="200" />
      </div>
      <TemplatesFieldList :fields="fields" :depth="1" :readonly="readonly" />
    </div>
    <Card class="content-start lg:sticky lg:top-4 lg:max-h-[calc(100svh-2rem)] lg:overflow-auto">
      <CardHeader>
        <CardTitle>Schema preview</CardTitle>
        <CardDescription>What the model is asked for: an array of Invoices with these Fields.</CardDescription>
      </CardHeader>
      <CardContent>
        <p v-if="preview.error" class="text-sm text-destructive" role="status">{{ preview.error }}</p>
        <pre v-else class="overflow-auto rounded-md bg-muted p-3 text-xs" data-testid="schema-preview">{{ preview.json }}</pre>
      </CardContent>
    </Card>
  </div>
</template>
