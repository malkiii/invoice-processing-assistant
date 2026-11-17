<script setup lang="ts">
import { AlertTriangle, CheckCircle2, Pencil, Plug, Trash2 } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

definePageMeta({ layout: 'app', middleware: 'auth' })
useHead({ title: 'Providers' })

interface Preset {
  kind: string
  label: string
  requiresApiKey: boolean
  requiresBaseUrl: boolean
  defaultBaseUrl: string | null
  suggestedModel: string | null
}
interface Connection {
  id: string
  kind: string
  name: string
  apiKeyHint: string | null
  baseUrl: string | null
  defaultModel: string | null
  status: 'ok' | 'broken'
  statusMessage: string | null
}
type TestResult = { ok: true; model: string } | { ok: false; reason: string; message: string }

const selectClass =
  'border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 dark:bg-input/30'

const { data: presets } = await useFetch<Preset[]>('/api/providers/presets', { default: () => [] })
const { data: connections, refresh } = await useFetch<Connection[]>('/api/providers', { default: () => [] })
const presetFor = (kind: string) => presets.value.find((p) => p.kind === kind)

function errorMessage(error: unknown, fallback: string) {
  const e = error as { data?: { statusMessage?: string; message?: string } }
  return e?.data?.statusMessage ?? e?.data?.message ?? fallback
}

// Add / edit form
const editingId = ref<string | null>(null)
const formOpen = ref(false)
const form = reactive({ kind: 'openai', name: '', apiKey: '', baseUrl: '', defaultModel: '' })
const formError = ref<string | null>(null)
const formPreset = computed(() => presetFor(form.kind))

function openAdd() {
  editingId.value = null
  Object.assign(form, { kind: 'openai', name: '', apiKey: '', baseUrl: '', defaultModel: '' })
  formError.value = null
  formOpen.value = true
}

function openEdit(c: Connection) {
  editingId.value = c.id
  Object.assign(form, { kind: c.kind, name: c.name, apiKey: '', baseUrl: c.baseUrl ?? '', defaultModel: c.defaultModel ?? '' })
  formError.value = null
  formOpen.value = true
}

async function saveForm() {
  formError.value = null
  try {
    if (editingId.value) {
      await $fetch(`/api/providers/${editingId.value}`, {
        method: 'PATCH',
        // An empty key field keeps the stored key.
        body: { name: form.name, apiKey: form.apiKey || undefined, baseUrl: form.baseUrl, defaultModel: form.defaultModel },
      })
    } else {
      await $fetch('/api/providers', { method: 'POST', body: { ...form } })
    }
    form.apiKey = ''
    formOpen.value = false
    await refresh()
  } catch (error) {
    formError.value = errorMessage(error, 'Could not save the Provider Connection.')
  }
}

async function remove(c: Connection) {
  if (!confirm(`Delete "${c.name}"? Its saved key is erased.`)) return
  await $fetch(`/api/providers/${c.id}`, { method: 'DELETE' })
  await refresh()
}

// Test connection
const testing = ref<string | null>(null)
const testResults = ref<Record<string, TestResult>>({})

async function test(c: Connection) {
  testing.value = c.id
  try {
    testResults.value[c.id] = await $fetch<TestResult>(`/api/providers/${c.id}/test`, { method: 'POST', body: {} })
    await refresh()
  } finally {
    testing.value = null
  }
}

// Models: list from the provider where possible, otherwise free text
const models = ref<Record<string, { ok: boolean; models: string[]; message?: string }>>({})

async function loadModels(c: Connection) {
  models.value[c.id] = await $fetch<{ ok: boolean; models: string[]; message?: string }>(`/api/providers/${c.id}/models` as string)
}

// Per-model capability override and price
const modelPanel = ref<string | null>(null)

function toggleModels(c: Connection) {
  modelPanel.value = modelPanel.value === c.id ? null : c.id
  if (modelPanel.value && !models.value[c.id]) loadModels(c)
}
</script>

<template>
  <div class="grid max-w-3xl gap-6">
    <h1 class="text-2xl font-semibold">Settings</h1>
    <SettingsNav />

    <div class="flex items-center justify-between gap-4">
      <p class="text-sm text-muted-foreground">
        Bring your own key. Keys are encrypted at rest and never sent back to your browser.
      </p>
      <Button v-if="!formOpen" @click="openAdd"><Plug class="size-4" /> Add provider</Button>
    </div>

    <Card v-if="formOpen">
      <CardHeader>
        <CardTitle>{{ editingId ? 'Edit Provider Connection' : 'Add a Provider Connection' }}</CardTitle>
      </CardHeader>
      <CardContent>
        <form class="grid gap-4" @submit.prevent="saveForm">
          <div class="grid gap-2">
            <Label for="kind">Provider</Label>
            <select id="kind" v-model="form.kind" :class="selectClass" :disabled="!!editingId">
              <option v-for="p in presets" :key="p.kind" :value="p.kind">{{ p.label }}</option>
            </select>
          </div>
          <div class="grid gap-2">
            <Label for="name">Name</Label>
            <Input id="name" v-model="form.name" :placeholder="formPreset?.label" />
          </div>
          <div class="grid gap-2">
            <Label for="apiKey">API key{{ formPreset?.requiresApiKey ? '' : ' (optional)' }}</Label>
            <Input
              id="apiKey"
              v-model="form.apiKey"
              type="password"
              autocomplete="off"
              :required="formPreset?.requiresApiKey && !editingId"
              :placeholder="editingId ? 'Leave empty to keep the saved key' : ''"
            />
          </div>
          <div class="grid gap-2">
            <Label for="baseUrl">Base URL{{ formPreset?.requiresBaseUrl ? '' : ' (optional)' }}</Label>
            <Input
              id="baseUrl"
              v-model="form.baseUrl"
              type="url"
              :required="formPreset?.requiresBaseUrl"
              :placeholder="formPreset?.defaultBaseUrl ?? 'https://…/v1'"
            />
          </div>
          <div class="grid gap-2">
            <Label for="defaultModel">Default model</Label>
            <Input
              id="defaultModel"
              v-model="form.defaultModel"
              :placeholder="formPreset?.suggestedModel ?? 'model id'"
              :list="editingId ? `models-${editingId}` : undefined"
            />
          </div>
          <FormError :message="formError" />
          <div class="flex gap-2">
            <Button type="submit">Save</Button>
            <Button type="button" variant="ghost" @click="formOpen = false">Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>

    <p v-if="connections.length === 0 && !formOpen" class="text-sm text-muted-foreground">
      No Provider Connections yet. Add one to start extracting invoices.
    </p>

    <Card v-for="c in connections" :key="c.id" :data-testid="`provider-${c.id}`">
      <CardHeader>
        <div class="flex items-start justify-between gap-4">
          <div class="grid gap-1">
            <CardTitle class="flex items-center gap-2">
              {{ c.name }}
              <Badge v-if="c.status === 'broken'" variant="destructive"><AlertTriangle /> Broken</Badge>
            </CardTitle>
            <CardDescription>
              {{ presetFor(c.kind)?.label ?? c.kind }}
              <template v-if="c.apiKeyHint"> · key <span class="font-mono">{{ c.apiKeyHint }}</span></template>
              <template v-if="c.baseUrl"> · {{ c.baseUrl }}</template>
              <template v-if="c.defaultModel"> · {{ c.defaultModel }}</template>
            </CardDescription>
          </div>
          <div class="flex shrink-0 gap-1">
            <Button size="sm" variant="outline" :disabled="testing === c.id" @click="test(c)">
              {{ testing === c.id ? 'Testing…' : 'Test connection' }}
            </Button>
            <Button size="icon" variant="ghost" aria-label="Edit" @click="openEdit(c); loadModels(c)">
              <Pencil class="size-4" />
            </Button>
            <Button size="icon" variant="ghost" aria-label="Delete" @click="remove(c)">
              <Trash2 class="size-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent class="grid gap-3">
        <p v-if="c.status === 'broken'" role="alert" class="text-sm text-destructive">
          {{ c.statusMessage ?? 'This connection stopped working.' }} Edit it to enter a new key.
        </p>
        <p v-if="testResults[c.id]?.ok" class="flex items-center gap-1 text-sm text-primary">
          <CheckCircle2 class="size-4" /> Connected using {{ (testResults[c.id] as { model: string }).model }}.
        </p>
        <p v-else-if="testResults[c.id]" class="text-sm text-destructive">
          {{ (testResults[c.id] as { message: string }).message }}
        </p>

        <datalist :id="`models-${c.id}`">
          <option v-for="m in models[c.id]?.models ?? []" :key="m" :value="m" />
        </datalist>

        <div>
          <Button size="sm" variant="ghost" class="px-0" @click="toggleModels(c)">
            {{ modelPanel === c.id ? 'Hide models' : 'Models, capabilities and prices' }}
          </Button>
        </div>
        <template v-if="modelPanel === c.id">
          <p v-if="models[c.id] && !models[c.id]!.ok" class="text-xs text-muted-foreground">
            This provider did not return a model list ({{ models[c.id]!.message }}). Type a model id instead.
          </p>
          <ProviderModelSettings :connection-id="c.id" :default-model="c.defaultModel" :models-list-id="`models-${c.id}`" />
        </template>
      </CardContent>
    </Card>
  </div>
</template>
