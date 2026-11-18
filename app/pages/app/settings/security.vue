<script setup lang="ts">
import { renderSVG } from 'uqr'
import { authClient } from '~/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

definePageMeta({ layout: 'app', middleware: 'auth' })
useHead({ title: 'Security' })

const { user, session, refresh } = useAuthSession()

// Password
const passwords = reactive({ currentPassword: '', newPassword: '' })
const passwordMessage = ref<string | null>(null)
const passwordError = ref<string | null>(null)

async function changePassword() {
  passwordMessage.value = null
  passwordError.value = null
  const { error } = await authClient.changePassword({ ...passwords, revokeOtherSessions: true })
  if (error) {
    passwordError.value = error.message ?? 'Could not change the password.'
    return
  }
  passwords.currentPassword = ''
  passwords.newPassword = ''
  passwordMessage.value = 'Password changed. Other sessions were signed out.'
  await loadSessions()
}

// Two-factor (TOTP)
const twoFactorPassword = ref('')
const totpCode = ref('')
const setup = ref<{ qr: string; uri: string; backupCodes: string[] } | null>(null)
const twoFactorError = ref<string | null>(null)

async function startTwoFactor() {
  twoFactorError.value = null
  const { data, error } = await authClient.twoFactor.enable({
    password: twoFactorPassword.value,
    method: 'totp',
  })
  if (error || data?.method !== 'totp') {
    twoFactorError.value = error?.message ?? 'Could not start two-factor setup.'
    return
  }
  setup.value = { qr: renderSVG(data.totpURI), uri: data.totpURI, backupCodes: data.backupCodes }
}

async function confirmTwoFactor() {
  twoFactorError.value = null
  const { error } = await authClient.twoFactor.verifyTotp({ code: totpCode.value })
  if (error) {
    twoFactorError.value = error.message ?? 'That code did not work.'
    return
  }
  setup.value = null
  twoFactorPassword.value = ''
  totpCode.value = ''
  await refresh()
}

async function disableTwoFactor() {
  twoFactorError.value = null
  const { error } = await authClient.twoFactor.disable({ password: twoFactorPassword.value })
  if (error) {
    twoFactorError.value = error.message ?? 'Could not disable two-factor authentication.'
    return
  }
  twoFactorPassword.value = ''
  await refresh()
}

// Sessions
type SessionRow = { id: string; token: string; userAgent?: string | null; ipAddress?: string | null; createdAt: Date }
const sessions = ref<SessionRow[]>([])

async function loadSessions() {
  const { data } = await authClient.listSessions()
  sessions.value = (data ?? []) as SessionRow[]
}

async function revoke(token: string) {
  await authClient.revokeSession({ token })
  await loadSessions()
}

async function revokeOthers() {
  await authClient.revokeOtherSessions()
  await loadSessions()
}

onMounted(loadSessions)
</script>

<template>
  <div class="grid max-w-2xl grid-cols-1 gap-6">
    <h1 class="text-2xl font-semibold">Settings</h1>
    <SettingsNav />

    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Changing it signs out your other sessions.</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="grid gap-4" @submit.prevent="changePassword">
          <div class="grid gap-2">
            <Label for="current-password">Current password</Label>
            <Input id="current-password" v-model="passwords.currentPassword" type="password" autocomplete="current-password" required />
          </div>
          <div class="grid gap-2">
            <Label for="new-password">New password</Label>
            <Input id="new-password" v-model="passwords.newPassword" type="password" autocomplete="new-password" minlength="8" required />
          </div>
          <FormError :message="passwordError" />
          <p v-if="passwordMessage" class="text-sm text-muted-foreground">{{ passwordMessage }}</p>
          <Button type="submit" class="justify-self-start">Change password</Button>
        </form>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Two-factor authentication</CardTitle>
        <CardDescription>
          {{ user?.twoFactorEnabled ? 'Enabled. You are asked for a code from your authenticator app when signing in.' : 'Add a one-time code from an authenticator app to your sign-in.' }}
        </CardDescription>
      </CardHeader>
      <CardContent class="grid gap-4">
        <template v-if="setup">
          <p class="text-sm">Scan this code with your authenticator app, then enter the 6-digit code it shows.</p>
          <!-- eslint-disable-next-line vue/no-v-html -- SVG generated locally from the TOTP URI -->
          <div class="w-44 rounded bg-white p-2" v-html="setup.qr" />
          <details class="text-sm">
            <summary class="cursor-pointer text-muted-foreground">Backup codes (save them somewhere safe)</summary>
            <ul class="num mt-2 grid grid-cols-2 gap-1">
              <li v-for="code in setup.backupCodes" :key="code">{{ code }}</li>
            </ul>
          </details>
          <form class="grid gap-2" @submit.prevent="confirmTwoFactor">
            <Label for="totp">Code</Label>
            <Input id="totp" v-model="totpCode" class="num" autocomplete="one-time-code" required />
            <Button type="submit" class="justify-self-start">Confirm and enable</Button>
          </form>
        </template>
        <form v-else class="grid gap-2" @submit.prevent="user?.twoFactorEnabled ? disableTwoFactor() : startTwoFactor()">
          <Label for="twofactor-password">Password</Label>
          <Input id="twofactor-password" v-model="twoFactorPassword" type="password" autocomplete="current-password" required />
          <Button type="submit" class="justify-self-start" :variant="user?.twoFactorEnabled ? 'destructive' : 'default'">
            {{ user?.twoFactorEnabled ? 'Disable two-factor' : 'Set up two-factor' }}
          </Button>
        </form>
        <FormError :message="twoFactorError" />
      </CardContent>
    </Card>

    <Card class="min-w-0">
      <CardHeader>
        <CardTitle>Sessions</CardTitle>
        <CardDescription>Devices currently signed in to your account.</CardDescription>
      </CardHeader>
      <CardContent class="grid gap-3">
        <div v-for="row in sessions" :key="row.id" class="flex min-w-0 items-center justify-between gap-4 rounded-md border p-3 text-sm">
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium" :title="row.userAgent ?? undefined">{{ describeUserAgent(row.userAgent) }}</p>
            <p class="num text-xs text-muted-foreground">
              {{ row.ipAddress ?? '—' }} · {{ new Date(row.createdAt).toLocaleString() }}
            </p>
          </div>
          <span v-if="row.id === session?.session.id" class="shrink-0 text-xs text-primary">This device</span>
          <Button v-else variant="outline" size="sm" class="shrink-0" @click="revoke(row.token)">Sign out</Button>
        </div>
        <Button v-if="sessions.length > 1" variant="outline" class="justify-self-start" @click="revokeOthers">
          Sign out all other sessions
        </Button>
      </CardContent>
    </Card>
  </div>
</template>
