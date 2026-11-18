<script setup lang="ts">
import { AlertTriangle, CheckCircle2, Unplug } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { SourceOption } from '~/composables/useSourcePickers'

definePageMeta({ layout: 'app', middleware: 'auth' })
useHead({ title: 'Sources' })

const { data: sources, refresh } = await useFetch<SourceOption[]>('/api/sources', { default: () => [] })
const enabled = computed(() => sources.value.filter((s) => s.enabled))

// The OAuth callback comes back here with ?connected=<kind> or ?error=<message>.
const route = useRoute()
const notice = computed(() => {
  const connected = sources.value.find((s) => s.kind === route.query.connected)
  return connected ? `${connected.label} is connected.` : null
})
const error = ref<string | null>(typeof route.query.error === 'string' ? route.query.error : null)

const disconnecting = ref<string | null>(null)

async function disconnect(source: SourceOption) {
  if (!confirm(`Disconnect ${source.label}? Access is revoked and its tokens are erased.`)) return
  disconnecting.value = source.kind
  error.value = null
  try {
    await $fetch(`/api/sources/${source.slug}`, { method: 'DELETE' })
    await refresh()
  } catch (err: any) {
    error.value = err?.data?.statusMessage ?? `Could not disconnect ${source.label}.`
  } finally {
    disconnecting.value = null
  }
}
</script>

<template>
  <div class="grid max-w-2xl grid-cols-1 gap-6">
    <h1 class="text-2xl font-semibold">Settings</h1>
    <SettingsNav />

    <p class="text-sm text-muted-foreground">
      Connect Google Drive or Dropbox to add Documents from them on the Intake page. A Source Connection only
      reads files you pick. It is separate from the account you sign in with.
    </p>

    <p v-if="notice" role="status" class="flex items-center gap-1 text-sm text-primary">
      <CheckCircle2 class="size-4" /> {{ notice }}
    </p>
    <FormError :message="error" />

    <p v-if="enabled.length === 0" class="text-sm text-muted-foreground">
      No sources are enabled on this instance. Ask the Admin to register an app with Google Drive or Dropbox and
      set its credentials in the environment.
    </p>

    <Card v-for="s in enabled" :key="s.kind" :data-testid="`source-${s.kind}`">
      <CardHeader>
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div class="grid min-w-0 gap-1">
            <CardTitle class="flex items-center gap-2">
              {{ s.label }}
              <Badge v-if="s.connection?.status === 'broken'" variant="destructive"><AlertTriangle /> Broken</Badge>
            </CardTitle>
            <CardDescription v-if="s.connection" class="break-words">
              Connected as {{ s.connection.accountLabel }} · since {{ formatDateTime(s.connection.connectedAt) }}
            </CardDescription>
          </div>
          <div class="flex shrink-0 gap-1">
            <Button as-child size="sm" :variant="s.connection?.status === 'ok' ? 'outline' : 'default'">
              <a :href="`/api/sources/${s.slug}/connect`">{{ s.connection ? 'Reconnect' : 'Connect' }}</a>
            </Button>
            <Button
              v-if="s.connection"
              size="sm"
              variant="ghost"
              :disabled="disconnecting === s.kind"
              @click="disconnect(s)"
            >
              <Unplug class="size-4" /> Disconnect
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent v-if="s.connection?.status === 'broken'">
        <p role="alert" class="text-sm text-destructive">{{ s.connection.statusMessage }}</p>
      </CardContent>
    </Card>
  </div>
</template>
