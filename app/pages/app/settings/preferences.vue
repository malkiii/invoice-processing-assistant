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

const selectClass =
  'border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 dark:bg-input/30'

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
const models = ref<string[]>([])
const saved = ref(false)
const error = ref<string | null>(null)

const selectedConnection = computed(() => connections.value.find((c) => c.id === form.defaultConnectionId))

watch(
  () => form.defaultConnectionId,
  async (id) => {
    models.value = []
    if (!id) return
    const result = await $fetch<{ models: string[] }>(`/api/providers/${id}/models`).catch(() => ({ models: [] }))
    models.value = result.models
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
            <select id="connection" v-model="form.defaultConnectionId" :class="selectClass">
              <option value="">None</option>
              <option v-for="c in connections" :key="c.id" :value="c.id">
                {{ c.name }}{{ c.status === 'broken' ? ' (broken)' : '' }}
              </option>
            </select>
          </div>
          <div class="grid gap-2">
            <Label for="model">Model</Label>
            <Input
              id="model"
              v-model="form.defaultModel"
              list="default-models"
              :placeholder="selectedConnection?.defaultModel ?? 'model id'"
            />
            <datalist id="default-models">
              <option v-for="m in models" :key="m" :value="m" />
            </datalist>
            <p class="text-xs text-muted-foreground">Leave empty to use the connection's default model.</p>
          </div>
          <div class="grid gap-2">
            <Label for="template">Template</Label>
            <select id="template" v-model="form.defaultTemplateId" :class="selectClass">
              <option value="">Built-in default</option>
              <option v-for="t in templates.filter((t) => !t.builtIn)" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
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
            <select id="theme" v-model="form.theme" :class="selectClass">
              <option value="noir">Ledger Noir</option>
              <option value="day">Ledger Day</option>
            </select>
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
