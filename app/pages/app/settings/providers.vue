<script setup lang="ts">
import { AlertTriangle, CheckCircle2, Loader2, Pencil, Plug, Trash2 } from '@lucide/vue'
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
type ModelList = { ok: true; models: string[] } | { ok: false; models: []; reason: string; message: string }

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
const kindOptions = computed(() => presets.value.map((p) => ({ value: p.kind, label: p.label })))

/**
 * The key is checked while the form is filled in, by fetching the provider's model list.
 * - ok: the Default model can only be one of the listed models
 * - unlisted: the key may work but the provider has no model list, so the id is typed
 * - failed: the key was rejected or the host is unreachable; saving is blocked
 */
type KeyCheck =
  | { status: 'idle' | 'checking' }
  | { status: 'ok'; models: string[] }
  | { status: 'unlisted' | 'failed'; message: string }
const keyCheck = ref<KeyCheck>({ status: 'idle' })
const formModels = computed(() => (keyCheck.value.status === 'ok' ? keyCheck.value.models : null))
const canSave = computed(() => keyCheck.value.status === 'ok' || keyCheck.value.status === 'unlisted')

let checkTimer: ReturnType<typeof setTimeout> | undefined
let checkRun = 0

function credentialsReady() {
  const preset = formPreset.value
  if (!preset) return false
  if (preset.requiresApiKey && !form.apiKey.trim() && !editingId.value) return false
  if (preset.requiresBaseUrl && !form.baseUrl.trim()) return false
  return true
}

async function checkKey() {
  clearTimeout(checkTimer)
  const run = ++checkRun
  if (!formOpen.value || !credentialsReady()) {
    keyCheck.value = { status: 'idle' }
    return
  }
  keyCheck.value = { status: 'checking' }
  let result: ModelList
  try {
    result = await $fetch<ModelList>('/api/providers/check', {
      method: 'POST',
      body: { kind: form.kind, apiKey: form.apiKey, baseUrl: form.baseUrl, connectionId: editingId.value },
    })
  } catch (error) {
    result = { ok: false, models: [], reason: 'invalid', message: errorMessage(error, 'Could not check the key.') }
  }
  if (run !== checkRun) return
  if (result.ok) {
    keyCheck.value = { status: 'ok', models: result.models }
    if (!result.models.includes(form.defaultModel)) {
      const suggested = formPreset.value?.suggestedModel
      form.defaultModel = suggested && result.models.includes(suggested) ? suggested : ''
    }
  } else if (result.reason === 'error') {
    keyCheck.value = { status: 'unlisted', message: result.message }
  } else {
    keyCheck.value = { status: 'failed', message: result.message }
  }
}

function scheduleKeyCheck() {
  clearTimeout(checkTimer)
  checkRun++
  keyCheck.value = { status: 'idle' }
  checkTimer = setTimeout(checkKey, 600)
}

watch(() => [form.kind, form.apiKey, form.baseUrl], scheduleKeyCheck)
onBeforeUnmount(() => clearTimeout(checkTimer))

function openAdd() {
  editingId.value = null
  Object.assign(form, { kind: 'openai', name: '', apiKey: '', baseUrl: '', defaultModel: '' })
  formError.value = null
  formOpen.value = true
  keyCheck.value = { status: 'idle' }
}

function openEdit(c: Connection) {
  editingId.value = c.id
  Object.assign(form, { kind: c.kind, name: c.name, apiKey: '', baseUrl: c.baseUrl ?? '', defaultModel: c.defaultModel ?? '' })
  formError.value = null
  formOpen.value = true
  // The saved key is checked right away so the model list is ready.
  nextTick(checkKey)
}

async function saveForm() {
  formError.value = null
  if (!canSave.value) return
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
  <div class="grid max-w-3xl grid-cols-1 gap-6">
    <h1 class="text-2xl font-semibold">Settings</h1>
    <SettingsNav />

    <div class="flex flex-wrap items-center justify-between gap-4">
      <p class="min-w-0 flex-1 basis-64 text-sm text-muted-foreground">
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
            <AppSelect id="kind" v-model="form.kind" :options="kindOptions" :disabled="!!editingId" />
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
              @blur="checkKey"
            />
            <p v-if="keyCheck.status === 'checking'" class="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 class="size-3 animate-spin" /> Checking the key…
            </p>
            <p v-else-if="keyCheck.status === 'ok'" class="flex items-center gap-1 text-xs text-primary">
              <CheckCircle2 class="size-3" /> Key works. Choose one of its {{ keyCheck.models.length }} models.
            </p>
            <p v-else-if="keyCheck.status === 'failed'" role="alert" class="text-xs text-destructive">
              {{ keyCheck.message }}
            </p>
            <p v-else-if="keyCheck.status === 'unlisted'" class="text-xs text-muted-foreground">
              This provider did not return a model list ({{ keyCheck.message }}). Type a model id instead.
            </p>
          </div>
          <div class="grid gap-2">
            <Label for="baseUrl">Base URL{{ formPreset?.requiresBaseUrl ? '' : ' (optional)' }}</Label>
            <Input
              id="baseUrl"
              v-model="form.baseUrl"
              type="url"
              :required="formPreset?.requiresBaseUrl"
              :placeholder="formPreset?.defaultBaseUrl ?? 'https://…/v1'"
              @blur="checkKey"
            />
          </div>
          <div class="grid gap-2">
            <Label for="defaultModel">Default model</Label>
            <ModelCombobox
              id="defaultModel"
              v-model="form.defaultModel"
              :models="formModels"
              :required="!!formModels"
              :disabled="!canSave"
              :placeholder="formModels ? 'Choose a model' : (formPreset?.suggestedModel ?? 'model id')"
            />
          </div>
          <FormError :message="formError" />
          <div class="flex gap-2">
            <Button type="submit" :disabled="!canSave">Save</Button>
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
        <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div class="grid min-w-0 gap-1">
            <CardTitle class="flex items-center gap-2">
              {{ c.name }}
              <Badge v-if="c.status === 'broken'" variant="destructive"><AlertTriangle /> Broken</Badge>
            </CardTitle>
            <CardDescription class="break-all">
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
            <Button size="icon" variant="ghost" aria-label="Edit" @click="openEdit(c)">
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

        <div>
          <Button size="sm" variant="ghost" class="px-0" @click="toggleModels(c)">
            {{ modelPanel === c.id ? 'Hide models' : 'Models, capabilities and prices' }}
          </Button>
        </div>
        <template v-if="modelPanel === c.id">
          <p v-if="models[c.id] && !models[c.id]!.ok" class="text-xs text-muted-foreground">
            This provider did not return a model list ({{ models[c.id]!.message }}). Type a model id instead.
          </p>
          <ProviderModelSettings
            :connection-id="c.id"
            :default-model="c.defaultModel"
            :models="models[c.id]?.ok ? models[c.id]!.models : null"
          />
        </template>
      </CardContent>
    </Card>
  </div>
</template>
