<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Per-model Model Capability override and price for one Provider Connection. */
type Capability = 'pdf' | 'images' | 'text'
interface ModelSetting {
  modelId: string
  builtInCapability: Capability
  capabilityOverride: Capability | null
  capability: Capability
  price: { inputPerMillion: number; outputPerMillion: number } | null
}

const props = defineProps<{
  connectionId: string
  defaultModel: string | null
  /** The provider's model ids, or null when it cannot list them (the id is typed instead) */
  models: string[] | null
}>()

const capabilityLabels: Record<Capability, string> = { pdf: 'Native PDF', images: 'Images', text: 'Text only' }
const capabilities = Object.keys(capabilityLabels) as Capability[]
const capabilityOptions = computed(() => [
  { value: '' as const, label: `Built-in: ${current.value ? capabilityLabels[current.value.builtInCapability] : ''}` },
  ...capabilities.map((cap) => ({ value: cap, label: capabilityLabels[cap] })),
])

const endpoint = `/api/providers/${props.connectionId}/model-settings` as string
const modelId = ref('')
const capabilityOverride = ref<Capability | ''>('')
const inputPrice = ref<string | number>('')
const outputPrice = ref<string | number>('')
const current = ref<ModelSetting | null>(null)
const saved = ref<ModelSetting[]>([])
const error = ref<string | null>(null)

async function select(id: string) {
  modelId.value = id.trim()
  current.value = null
  error.value = null
  if (!modelId.value) return
  const s = await $fetch<ModelSetting>(endpoint, { query: { model: modelId.value } })
  current.value = s
  capabilityOverride.value = s.capabilityOverride ?? ''
  inputPrice.value = s.price?.inputPerMillion ?? ''
  outputPrice.value = s.price?.outputPerMillion ?? ''
}

async function save() {
  error.value = null
  const hasPrice = inputPrice.value !== '' && outputPrice.value !== ''
  try {
    current.value = await $fetch<ModelSetting>(endpoint, {
      method: 'PUT',
      body: {
        modelId: modelId.value,
        capabilityOverride: capabilityOverride.value || null,
        price: hasPrice ? { inputPerMillion: Number(inputPrice.value), outputPerMillion: Number(outputPrice.value) } : null,
      },
    })
    saved.value = await $fetch<ModelSetting[]>(endpoint)
  } catch (e) {
    const err = e as { data?: { statusMessage?: string } }
    error.value = err.data?.statusMessage ?? 'Could not save the model settings.'
  }
}

onMounted(async () => {
  saved.value = await $fetch<ModelSetting[]>(endpoint)
  await select(props.defaultModel ?? '')
})
</script>

<template>
  <div class="grid gap-4 rounded-md border p-4">
    <form class="grid gap-4" @submit.prevent="save">
      <div class="grid gap-2">
        <Label :for="`model-${connectionId}`">Model</Label>
        <ModelCombobox
          :id="`model-${connectionId}`"
          :model-value="modelId"
          :models="models"
          placeholder="model id"
          @change="select"
        />
      </div>
      <template v-if="current">
        <div class="grid gap-2">
          <Label :for="`cap-${connectionId}`">Model Capability</Label>
          <AppSelect :id="`cap-${connectionId}`" v-model="capabilityOverride" :options="capabilityOptions" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="grid gap-2">
            <Label :for="`in-${connectionId}`">Input price / 1M tokens</Label>
            <Input :id="`in-${connectionId}`" v-model="inputPrice" type="number" min="0" step="any" />
          </div>
          <div class="grid gap-2">
            <Label :for="`out-${connectionId}`">Output price / 1M tokens</Label>
            <Input :id="`out-${connectionId}`" v-model="outputPrice" type="number" min="0" step="any" />
          </div>
        </div>
        <FormError :message="error" />
        <div><Button type="submit" size="sm">Save model settings</Button></div>
      </template>
    </form>
    <table v-if="saved.length" class="w-full text-left text-sm">
      <thead class="text-xs text-muted-foreground">
        <tr><th class="py-1">Model</th><th>Capability</th><th>Input / 1M</th><th>Output / 1M</th></tr>
      </thead>
      <tbody>
        <tr v-for="s in saved" :key="s.modelId" class="cursor-pointer border-t" @click="select(s.modelId)">
          <td class="py-1 font-mono">{{ s.modelId }}</td>
          <td>
            {{ capabilityLabels[s.capability] }}
            <span v-if="s.capabilityOverride" class="text-muted-foreground">(override)</span>
          </td>
          <td>{{ s.price?.inputPerMillion ?? '—' }}</td>
          <td>{{ s.price?.outputPerMillion ?? '—' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
