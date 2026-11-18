<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

/**
 * Re-run (spec "Re-extraction", ADR 0005): pick a Provider Connection, model and Template,
 * defaulting to the User's global defaults, and warn when corrections would stay behind.
 */
const props = defineProps<{ documentId: string }>()
const emit = defineEmits<{ queued: [] }>()
const open = defineModel<boolean>('open', { default: false })

interface Connection { id: string; name: string; kind: string; defaultModel: string | null; status: string }
interface TemplateItem { id: string; name: string; isDefault?: boolean }

const dialog = ref<HTMLDialogElement>()
const connections = ref<Connection[]>([])
const templates = ref<TemplateItem[]>([])
const models = ref<string[] | null>(null)
const hasCorrections = ref(false)
const connectionId = ref('')
const modelId = ref('')
const templateId = ref('')
const error = ref('')
const connectionOptions = computed(() =>
  connections.value.map((c) => ({ value: c.id, label: `${c.name} (${c.kind})${c.status === 'broken' ? ' — broken' : ''}` })),
)
const templateOptions = computed(() =>
  templates.value.map((t) => ({ value: t.id, label: `${t.name}${t.isDefault ? ' (default)' : ''}` })),
)
const busy = ref(false)
let defaults: { defaultConnectionId: string | null; defaultModel: string | null } = { defaultConnectionId: null, defaultModel: null }

async function load() {
  error.value = ''
  const [conns, prefs, tpls, options] = await Promise.all([
    $fetch<Connection[]>('/api/providers'),
    $fetch<{ defaultConnectionId: string | null; defaultModel: string | null; defaultTemplateId: string | null }>('/api/preferences'),
    $fetch<TemplateItem[]>('/api/templates'),
    $fetch<{ hasCorrections: boolean }>(`/api/documents/${props.documentId}/rerun-options`),
  ])
  connections.value = conns
  templates.value = tpls
  hasCorrections.value = options.hasCorrections
  defaults = prefs
  connectionId.value = prefs.defaultConnectionId ?? conns[0]?.id ?? ''
  templateId.value = tpls.find((t) => t.isDefault)?.id ?? prefs.defaultTemplateId ?? tpls[0]?.id ?? ''
  pickDefaultModel()
}

function pickDefaultModel() {
  const conn = connections.value.find((c) => c.id === connectionId.value)
  modelId.value = (conn && conn.id === defaults.defaultConnectionId ? defaults.defaultModel : null) ?? conn?.defaultModel ?? ''
  models.value = null
  if (conn) {
    $fetch<{ ok: boolean; models: string[] }>(`/api/providers/${conn.id}/models`)
      .then((r) => {
        if (connectionId.value === conn.id) models.value = r.ok ? r.models : null
      })
      .catch(() => {})
  }
}

watch(open, async (isOpen) => {
  if (isOpen) {
    dialog.value?.showModal()
    try {
      await load()
    } catch (e) {
      error.value = (e as { statusMessage?: string }).statusMessage ?? 'Could not load the options.'
    }
  } else {
    dialog.value?.close()
  }
})

async function submit() {
  busy.value = true
  error.value = ''
  try {
    await $fetch(`/api/documents/${props.documentId}/rerun`, {
      method: 'POST',
      body: {
        connectionId: connectionId.value || undefined,
        modelId: modelId.value.trim() || undefined,
        templateId: templateId.value || undefined,
      },
    })
    open.value = false
    emit('queued')
  } catch (e) {
    error.value = (e as { statusMessage?: string; data?: { statusMessage?: string } }).data?.statusMessage
      ?? (e as { statusMessage?: string }).statusMessage
      ?? 'The re-run could not be queued.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border bg-card p-0 text-card-foreground backdrop:bg-black/60"
    aria-labelledby="rerun-title"
    @close="open = false"
  >
    <form class="grid gap-4 p-5" @submit.prevent="submit">
      <h2 id="rerun-title" class="text-lg font-semibold">Re-run extraction</h2>

      <p v-if="hasCorrections" class="flex gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm" data-testid="rerun-corrections-warning">
        <TriangleAlert class="mt-0.5 size-4 shrink-0 text-destructive" />
        <span>This Document's Current Extraction has corrections. They stay with that Extraction in the history and are <strong>not</strong> carried over to the new one.</span>
      </p>

      <div class="grid gap-1.5">
        <Label for="rerun-connection">Provider Connection</Label>
        <AppSelect
          id="rerun-connection"
          v-model="connectionId"
          :options="connectionOptions"
          disable-portal
          @change="pickDefaultModel"
        />
        <p v-if="!connections.length" class="text-sm text-muted-foreground">
          Add one in <NuxtLink to="/app/settings/providers" class="underline">Settings → Providers</NuxtLink>.
        </p>
      </div>

      <div class="grid gap-1.5">
        <Label for="rerun-model">Model</Label>
        <ModelCombobox id="rerun-model" v-model="modelId" :models="models" placeholder="Model id" disable-portal />
      </div>

      <div class="grid gap-1.5">
        <Label for="rerun-template">Template</Label>
        <AppSelect id="rerun-template" v-model="templateId" :options="templateOptions" disable-portal />
      </div>

      <p v-if="error" class="text-sm text-destructive" role="alert">{{ error }}</p>

      <div class="flex justify-end gap-2">
        <Button type="button" variant="ghost" @click="open = false">Cancel</Button>
        <Button type="submit" :disabled="busy || !connectionId">Re-run</Button>
      </div>
    </form>
  </dialog>
</template>
