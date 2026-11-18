<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DEFAULT_TEMPLATE_ID } from '~~/server/domain/template/default-template'

definePageMeta({ layout: 'app', middleware: 'auth' })

const route = useRoute()
const id = computed(() => String(route.params.id))
const { data: template, error: loadError } = await useFetch<TemplateDto>(() => `/api/templates/${id.value}`)
const { data: prefs, refresh: refreshPrefs } = await useFetch<{ defaultTemplateId: string | null }>('/api/preferences')
useHead({ title: () => template.value?.name ?? 'Template' })

const name = ref('')
const fields = reactive<DraftField[]>([])
const editor = ref<{ valid: boolean } | null>(null)
const error = ref<string | null>(null)
const saved = ref(false)
const saving = ref(false)

watch(
  template,
  (t) => {
    if (!t) return
    name.value = t.name
    fields.splice(0, fields.length, ...toDraft(t.fields))
  },
  { immediate: true },
)

const readonly = computed(() => template.value?.builtIn ?? true)
const isDefault = computed(() => (prefs.value?.defaultTemplateId ?? DEFAULT_TEMPLATE_ID) === template.value?.id)

function message(e: unknown, fallback: string) {
  return (e as { data?: { statusMessage?: string } }).data?.statusMessage ?? fallback
}

async function save() {
  error.value = null
  saved.value = false
  saving.value = true
  try {
    template.value = await $fetch<TemplateDto>(`/api/templates/${id.value}`, {
      method: 'PATCH',
      body: { name: name.value, fields: toFields(fields) },
    })
    saved.value = true
  } catch (e) {
    error.value = message(e, 'Could not save the Template.')
  } finally {
    saving.value = false
  }
}

async function clone() {
  error.value = null
  try {
    const copy = await $fetch<TemplateDto>('/api/templates', { method: 'POST', body: { cloneFrom: id.value } })
    await navigateTo(`/app/templates/${copy.id}`)
  } catch (e) {
    error.value = message(e, 'Could not clone the Template.')
  }
}

async function makeDefault() {
  error.value = null
  try {
    await $fetch('/api/preferences', { method: 'PATCH', body: { defaultTemplateId: id.value } })
    await refreshPrefs()
  } catch (e) {
    error.value = message(e, 'Could not set the default Template.')
  }
}
</script>

<template>
  <div v-if="loadError" class="grid gap-2">
    <h1 class="text-2xl font-semibold">Template not found</h1>
    <NuxtLink to="/app/templates" class="text-sm underline">Back to Templates</NuxtLink>
  </div>
  <form v-else-if="template" class="grid grid-cols-1 gap-6" @submit.prevent="save">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <NuxtLink to="/app/templates" class="text-sm text-muted-foreground underline">Templates</NuxtLink>
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-2xl font-semibold break-words">{{ template.name }}</h1>
          <Badge v-if="template.builtIn" variant="secondary">Built-in, read-only</Badge>
          <Badge v-if="isDefault">Default</Badge>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span v-if="saved" class="text-sm text-muted-foreground">Saved.</span>
        <Button v-if="!isDefault" type="button" variant="outline" @click="makeDefault">Set as default</Button>
        <Button type="button" variant="outline" @click="clone">Clone</Button>
        <Button v-if="!readonly" type="submit" :disabled="saving || !editor?.valid">Save</Button>
      </div>
    </div>
    <p v-if="readonly" class="text-sm text-muted-foreground">
      The built-in default Template cannot be changed. Clone it to make your own.
    </p>
    <p v-else class="text-sm text-muted-foreground">
      Saving changes only future Extractions. Existing Invoices keep the Fields they were extracted with.
    </p>
    <FormError :message="error" />
    <TemplatesEditor ref="editor" v-model:name="name" :fields="fields" :readonly="readonly" />
  </form>
</template>
