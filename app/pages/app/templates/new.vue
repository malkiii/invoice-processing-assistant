<script setup lang="ts">
import { Button } from '@/components/ui/button'

definePageMeta({ layout: 'app', middleware: 'auth' })
useHead({ title: 'New Template' })

const name = ref('')
const fields = reactive<DraftField[]>([newDraftField()])
const editor = ref<{ valid: boolean } | null>(null)
const error = ref<string | null>(null)
const saving = ref(false)

async function save() {
  error.value = null
  saving.value = true
  try {
    const created = await $fetch<TemplateDto>('/api/templates', {
      method: 'POST',
      body: { name: name.value, fields: toFields(fields) },
    })
    await navigateTo(`/app/templates/${created.id}`)
  } catch (e) {
    error.value = (e as { data?: { statusMessage?: string } }).data?.statusMessage ?? 'Could not save the Template.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="grid gap-6" @submit.prevent="save">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <NuxtLink to="/app/templates" class="text-sm text-muted-foreground underline">Templates</NuxtLink>
        <h1 class="text-2xl font-semibold">New Template</h1>
      </div>
      <Button type="submit" :disabled="saving || !editor?.valid">Create Template</Button>
    </div>
    <FormError :message="error" />
    <TemplatesEditor ref="editor" v-model:name="name" :fields="fields" />
  </form>
</template>
