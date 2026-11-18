<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ThemeName } from '~/composables/useTheme'

definePageMeta({ layout: 'app', middleware: 'auth' })
useHead({ title: 'Preferences' })

interface Preferences {
  defaultConnectionId: string | null
  defaultModel: string | null
  defaultTemplateId: string | null
  theme: ThemeName
  autoDeleteAfterDays: number | null
}
interface Connection {
  id: string
  name: string
  defaultModel: string | null
  status: 'ok' | 'broken'
}


const { theme } = useTheme()
const { data: prefs } = await useFetch<Preferences>('/api/preferences')
const { data: connections } = await useFetch<Connection[]>('/api/providers', { default: () => [] })
const { data: templates } = await useFetch<TemplateDto[]>('/api/templates', { default: () => [] })

const form = reactive({
  defaultConnectionId: prefs.value?.defaultConnectionId ?? '',
  defaultModel: prefs.value?.defaultModel ?? '',
  defaultTemplateId: prefs.value?.defaultTemplateId ?? '',
  theme: prefs.value?.theme ?? theme.value,
  autoDelete: prefs.value?.autoDeleteAfterDays != null,
  autoDeleteAfterDays: prefs.value?.autoDeleteAfterDays ?? 30,
})
const models = ref<string[] | null>(null)
const saved = ref(false)
const error = ref<string | null>(null)

const selectedConnection = computed(() => connections.value.find((c) => c.id === form.defaultConnectionId))
const connectionOptions = computed(() => [
  { value: '', label: 'None' },
  ...connections.value.map((c) => ({ value: c.id, label: `${c.name}${c.status === 'broken' ? ' (broken)' : ''}` })),
])
const templateOptions = computed(() => [
  { value: '', label: 'Built-in default' },
  ...templates.value.filter((t) => !t.builtIn).map((t) => ({ value: t.id, label: t.name })),
])
const themeOptions: { value: ThemeName; label: string }[] = [
  { value: 'noir', label: 'Ledger Noir' },
  { value: 'day', label: 'Ledger Day' },
]

watch(
  () => form.defaultConnectionId,
  async (id) => {
    models.value = null
    if (!id) return
    const result = await $fetch<{ ok: boolean; models: string[] }>(`/api/providers/${id}/models`).catch(() => null)
    if (form.defaultConnectionId === id) models.value = result?.ok ? result.models : null
  },
  { immediate: true },
)

async function save() {
  saved.value = false
  error.value = null
  try {
    const result = await $fetch<Preferences>('/api/preferences', {
      method: 'PATCH',
      body: {
        defaultConnectionId: form.defaultConnectionId || null,
        defaultModel: form.defaultModel || null,
        defaultTemplateId: form.defaultTemplateId || null,
        theme: form.theme,
        autoDeleteAfterDays: form.autoDelete ? Number(form.autoDeleteAfterDays) : null,
      },
    })
    prefs.value = result
    theme.value = result.theme
    saved.value = true
  } catch (e) {
    const err = e as { data?: { statusMessage?: string } }
    error.value = err.data?.statusMessage ?? 'Could not save your preferences.'
  }
}
</script>

<template>
  <div class="grid max-w-2xl gap-6">
    <h1 class="text-2xl font-semibold">Settings</h1>
    <SettingsNav />
    <form class="grid gap-6" @submit.prevent="save">
      <Card>
        <CardHeader>
          <CardTitle>Defaults for intake</CardTitle>
          <CardDescription>Every Batch you add uses these.</CardDescription>
        </CardHeader>
        <CardContent class="grid gap-4">
          <p v-if="connections.length === 0" class="text-sm text-muted-foreground">
            <NuxtLink to="/app/settings/providers" class="underline">Add a Provider Connection</NuxtLink> first.
          </p>
          <div class="grid gap-2">
            <Label for="connection">Provider Connection</Label>
            <AppSelect id="connection" v-model="form.defaultConnectionId" :options="connectionOptions" />
          </div>
          <div class="grid gap-2">
            <Label for="model">Model</Label>
            <ModelCombobox
              id="model"
              v-model="form.defaultModel"
              :models="models"
              clearable
              :placeholder="selectedConnection?.defaultModel ?? 'model id'"
            />
            <p class="text-xs text-muted-foreground">Leave empty to use the connection's default model.</p>
          </div>
          <div class="grid gap-2">
            <Label for="template">Template</Label>
            <AppSelect id="template" v-model="form.defaultTemplateId" :options="templateOptions" />
            <p class="text-xs text-muted-foreground">
              <NuxtLink to="/app/templates" class="underline">Manage Templates</NuxtLink>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance and retention</CardTitle>
        </CardHeader>
        <CardContent class="grid gap-4">
          <div class="grid gap-2">
            <Label for="theme">Theme</Label>
            <AppSelect id="theme" v-model="form.theme" :options="themeOptions" />
          </div>
          <div class="grid gap-2">
            <label class="flex items-center gap-2 text-sm">
              <input v-model="form.autoDelete" type="checkbox" class="size-4 accent-primary" />
              Auto-delete Documents after
            </label>
            <div v-if="form.autoDelete" class="flex items-center gap-2">
              <Input id="autoDelete" v-model="form.autoDeleteAfterDays" type="number" min="1" max="3650" class="w-28" />
              <span class="text-sm text-muted-foreground">days</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <FormError :message="error" />
      <div class="flex items-center gap-3">
        <Button type="submit">Save</Button>
        <span v-if="saved" class="text-sm text-muted-foreground">Saved.</span>
      </div>
    </form>
  </div>
</template>
