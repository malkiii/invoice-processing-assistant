<script setup lang="ts">
import { z } from 'zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { compileTemplate, TemplateFieldError } from '~~/server/domain/template/compile'

/** Name, then tabs for the Field builder and a live JSON preview of the schema the model receives. */
const props = defineProps<{ fields: DraftField[]; readonly?: boolean }>()
const name = defineModel<string>('name', { required: true })

const preview = computed<{ json: unknown; error: string | null }>(() => {
  try {
    const schema = compileTemplate(toFields(props.fields))
    return { json: z.toJSONSchema(schema), error: null }
  } catch (error) {
    if (error instanceof TemplateFieldError) return { json: null, error: error.message }
    return { json: null, error: 'The Fields cannot be compiled yet.' }
  }
})

defineExpose({ valid: computed(() => preview.value.error === null) })
</script>

<template>
  <div class="grid gap-6">
    <div class="grid max-w-md gap-2">
      <Label for="template-name">Name</Label>
      <Input id="template-name" v-model="name" :disabled="readonly" maxlength="200" />
    </div>
    <Tabs default-value="fields" class="gap-4">
      <TabsList>
        <TabsTrigger value="fields" type="button">Fields</TabsTrigger>
        <TabsTrigger value="schema" type="button">
          Schema preview
          <span v-if="preview.error" class="size-1.5 rounded-full bg-destructive" aria-label="has errors" />
        </TabsTrigger>
      </TabsList>
      <TabsContent value="fields">
        <TemplatesFieldList :fields="fields" :depth="1" :readonly="readonly" />
      </TabsContent>
      <TabsContent value="schema">
        <Card>
          <CardHeader>
            <CardTitle>Schema preview</CardTitle>
            <CardDescription>What the model is asked for: an array of Invoices with these Fields.</CardDescription>
          </CardHeader>
          <CardContent>
            <p v-if="preview.error" class="text-sm text-destructive" role="status">{{ preview.error }}</p>
            <JsonTree v-else :value="preview.json" data-testid="schema-preview" />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  </div>
</template>
