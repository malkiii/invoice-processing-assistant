<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

definePageMeta({ layout: 'app', middleware: 'auth' })
useHead({ title: 'Templates' })

const { data: templates, refresh } = await useFetch<TemplateDto[]>('/api/templates', { default: () => [] })
const error = ref<string | null>(null)

function message(e: unknown, fallback: string) {
  return (e as { data?: { statusMessage?: string } }).data?.statusMessage ?? fallback
}

async function clone(t: TemplateDto) {
  error.value = null
  try {
    const copy = await $fetch<TemplateDto>('/api/templates', { method: 'POST', body: { cloneFrom: t.id } })
    await navigateTo(`/app/templates/${copy.id}`)
  } catch (e) {
    error.value = message(e, 'Could not clone the Template.')
  }
}

async function makeDefault(t: TemplateDto) {
  error.value = null
  try {
    await $fetch('/api/preferences', { method: 'PATCH', body: { defaultTemplateId: t.id } })
    await refresh()
  } catch (e) {
    error.value = message(e, 'Could not set the default Template.')
  }
}

async function remove(t: TemplateDto) {
  if (!confirm(`Delete "${t.name}"? Existing Invoices keep rendering from their snapshot.`)) return
  error.value = null
  try {
    await $fetch(`/api/templates/${t.id}`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    error.value = message(e, 'Could not delete the Template.')
  }
}
</script>

<template>
  <div class="grid grid-cols-1 gap-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Templates</h1>
        <p class="text-sm text-muted-foreground">The Fields extracted from each invoice. Clone the default to make your own.</p>
      </div>
      <Button as-child><NuxtLink to="/app/templates/new">New Template</NuxtLink></Button>
    </div>
    <FormError :message="error" />
    <ul class="grid gap-3">
      <li
        v-for="t in templates"
        :key="t.id"
        class="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4"
        data-testid="template-row"
      >
        <div class="grid min-w-0 gap-1">
          <div class="flex flex-wrap items-center gap-2">
            <NuxtLink :to="`/app/templates/${t.id}`" class="font-medium underline-offset-4 hover:underline">{{ t.name }}</NuxtLink>
            <Badge v-if="t.builtIn" variant="secondary">Built-in, read-only</Badge>
            <Badge v-if="t.isDefault">Default</Badge>
          </div>
          <p class="text-xs text-muted-foreground">{{ t.fields.length }} Fields</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" as-child>
            <NuxtLink :to="`/app/templates/${t.id}`">{{ t.builtIn ? 'View' : 'Edit' }}</NuxtLink>
          </Button>
          <Button variant="outline" size="sm" @click="clone(t)">Clone</Button>
          <Button v-if="!t.isDefault" variant="outline" size="sm" @click="makeDefault(t)">Set as default</Button>
          <Button v-if="!t.builtIn" variant="ghost" size="sm" @click="remove(t)">Delete</Button>
        </div>
      </li>
    </ul>
  </div>
</template>
