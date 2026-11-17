<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

definePageMeta({ layout: 'app', middleware: 'admin' })
useHead({ title: 'Admin' })

const MB = 1024 * 1024
const { user: me } = useAuthSession()

const { data: users, refresh: refreshUsers } = await useFetch('/api/admin/users')
const { data: invites, refresh: refreshInvites } = await useFetch('/api/admin/invites')
const { data: settings, refresh: refreshSettings } = await useFetch('/api/admin/settings')
const { data: health, refresh: refreshHealth, pending: healthPending } = await useFetch('/api/admin/health')

const error = ref<string | null>(null)
const notice = ref<string | null>(null)

function messageOf(err: unknown) {
  const e = err as { data?: { statusMessage?: string; message?: string }; message?: string }
  return e.data?.statusMessage ?? e.data?.message ?? e.message ?? 'Something went wrong.'
}

async function run(action: () => Promise<unknown>, done?: string) {
  error.value = null
  notice.value = null
  try {
    await action()
    if (done) notice.value = done
  } catch (err) {
    error.value = messageOf(err)
  }
}

// Invites
const inviteEmail = ref('')
const lastInviteLink = ref<string | null>(null)
async function invite() {
  await run(async () => {
    const result = await $fetch('/api/admin/invites', { method: 'POST', body: { email: inviteEmail.value } })
    lastInviteLink.value = result.emailed ? null : result.link
    notice.value = result.emailed
      ? `Invite emailed to ${result.invite.email}.`
      : `SMTP is not configured: share this link with ${result.invite.email}.`
    inviteEmail.value = ''
    await refreshInvites()
  })
}
const revokeInvite = (id: string) =>
  run(async () => {
    await $fetch(`/api/admin/invites/${id}`, { method: 'DELETE' })
    await refreshInvites()
  }, 'Invite revoked.')

// Users
const setDisabled = (id: string, disabled: boolean) =>
  run(async () => {
    await $fetch(`/api/admin/users/${id}/${disabled ? 'disable' : 'enable'}`, { method: 'POST' })
    await refreshUsers()
  }, disabled ? 'User disabled.' : 'User enabled.')

const deleteUser = (id: string, email: string) => {
  if (!confirm(`Delete ${email}? All of their Documents, Invoices and files are deleted permanently.`)) return
  return run(async () => {
    await $fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
    await refreshUsers()
  }, `${email} deleted.`)
}

// Settings
const form = reactive({ signUpPolicy: 'open', maxDocumentMb: 25, maxDocumentPages: 30, maxConcurrentDocumentsPerUser: 3 })
watchEffect(() => {
  if (!settings.value) return
  form.signUpPolicy = settings.value.signUpPolicy
  form.maxDocumentMb = Math.round((settings.value.maxDocumentBytes / MB) * 100) / 100
  form.maxDocumentPages = settings.value.maxDocumentPages
  form.maxConcurrentDocumentsPerUser = settings.value.maxConcurrentDocumentsPerUser
})
const saveSettings = () =>
  run(async () => {
    await $fetch('/api/admin/settings', {
      method: 'PATCH',
      body: {
        signUpPolicy: form.signUpPolicy,
        maxDocumentBytes: Math.round(Number(form.maxDocumentMb) * MB),
        maxDocumentPages: Number(form.maxDocumentPages),
        maxConcurrentDocumentsPerUser: Number(form.maxConcurrentDocumentsPerUser),
      },
    })
    await refreshSettings()
  }, 'Settings saved.')

function statusClass(status: string) {
  return status === 'ok' ? 'text-primary' : status === 'down' ? 'text-destructive' : 'text-muted-foreground'
}
</script>

<template>
  <div class="mx-auto grid max-w-5xl gap-6">
    <div>
      <h1 class="text-2xl font-semibold">Admin</h1>
      <p class="text-sm text-muted-foreground">Instance administration. User Documents and Invoices are not visible here.</p>
    </div>

    <p v-if="error" role="alert" class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ error }}</p>
    <p v-if="notice" role="status" class="rounded-md border px-3 py-2 text-sm">
      {{ notice }}
      <code v-if="lastInviteLink" class="mt-1 block break-all font-mono text-xs">{{ lastInviteLink }}</code>
    </p>

    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <CardDescription>Disabling a User signs them out and blocks sign-in. Deleting removes all of their data and files.</CardDescription>
      </CardHeader>
      <CardContent class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="text-left text-muted-foreground">
            <tr><th class="py-2 pr-4">Email</th><th class="pr-4">Name</th><th class="pr-4">Role</th><th class="pr-4">Status</th><th class="pr-4">Joined</th><th /></tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id" class="border-t">
              <td class="py-2 pr-4">{{ u.email }}</td>
              <td class="pr-4">{{ u.name }}</td>
              <td class="pr-4">{{ u.role }}</td>
              <td class="pr-4">{{ u.disabled ? 'Disabled' : u.emailVerified ? 'Active' : 'Unverified' }}</td>
              <td class="pr-4">{{ new Date(u.createdAt).toLocaleDateString() }}</td>
              <td class="flex justify-end gap-2 py-2">
                <template v-if="u.id !== me?.id && u.role !== 'admin'">
                  <Button size="sm" variant="outline" @click="setDisabled(u.id, !u.disabled)">{{ u.disabled ? 'Enable' : 'Disable' }}</Button>
                  <Button size="sm" variant="destructive" @click="deleteUser(u.id, u.email)">Delete</Button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Invites</CardTitle>
        <CardDescription>Invite links are valid for 7 days and only for the invited email.</CardDescription>
      </CardHeader>
      <CardContent class="grid gap-4">
        <form class="flex gap-2" @submit.prevent="invite">
          <Label for="invite-email" class="sr-only">Email</Label>
          <Input id="invite-email" v-model="inviteEmail" type="email" placeholder="name@example.com" required class="max-w-sm" />
          <Button type="submit">Invite</Button>
        </form>
        <ul v-if="invites?.length" class="grid gap-1 text-sm">
          <li v-for="i in invites" :key="i.id" class="flex items-center justify-between border-t py-2">
            <span>{{ i.email }} <span class="text-muted-foreground">· expires {{ new Date(i.expiresAt).toLocaleDateString() }}</span></span>
            <Button size="sm" variant="ghost" @click="revokeInvite(i.id)">Revoke</Button>
          </li>
        </ul>
        <p v-else class="text-sm text-muted-foreground">No pending invites.</p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Sign-up and limits</CardTitle>
        <CardDescription>Documents over the limits are rejected; they are never split.</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="grid max-w-md gap-4" @submit.prevent="saveSettings">
          <div class="grid gap-2">
            <Label for="policy">Sign-up policy</Label>
            <select id="policy" v-model="form.signUpPolicy" class="h-9 rounded-md border bg-background px-3 text-sm">
              <option value="open">Open: anyone can sign up</option>
              <option value="invite-only">Invite-only</option>
            </select>
          </div>
          <div class="grid gap-2">
            <Label for="max-mb">Max Document size (MB)</Label>
            <Input id="max-mb" v-model="form.maxDocumentMb" type="number" min="0.01" step="0.01" required />
          </div>
          <div class="grid gap-2">
            <Label for="max-pages">Max pages per Document</Label>
            <Input id="max-pages" v-model="form.maxDocumentPages" type="number" min="1" max="10000" step="1" required />
          </div>
          <div class="grid gap-2">
            <Label for="concurrency">Concurrent extractions per User</Label>
            <Input id="concurrency" v-model="form.maxConcurrentDocumentsPerUser" type="number" min="1" max="100" step="1" required />
          </div>
          <Button type="submit" class="justify-self-start">Save</Button>
        </form>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>System health</CardTitle>
      </CardHeader>
      <CardContent v-if="health" class="grid gap-2 text-sm">
        <p>Database: <span :class="statusClass(health.database.status)">{{ health.database.status }}</span></p>
        <p>
          Storage: <span :class="statusClass(health.storage.status)">{{ health.storage.status }}</span>
          <span v-if="health.storage.status === 'down'" class="text-muted-foreground"> · {{ health.storage.error }}</span>
        </p>
        <p>
          Queue: <span :class="statusClass(health.queue.status)">{{ health.queue.status }}</span>
          <span v-if="health.queue.status === 'ok'" class="text-muted-foreground"> · {{ health.queue.queued }} queued, {{ health.queue.active }} active</span>
          <span v-else class="text-muted-foreground"> · {{ health.queue.error }}</span>
        </p>
        <Button size="sm" variant="outline" class="justify-self-start" :disabled="healthPending" @click="refreshHealth()">Refresh</Button>
      </CardContent>
    </Card>
  </div>
</template>
