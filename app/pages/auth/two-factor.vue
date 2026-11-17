<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

definePageMeta({ layout: 'auth' })
useHead({ title: 'Two-factor authentication' })

const code = ref('')
const useBackupCode = ref(false)
const error = ref<string | null>(null)
const { refresh } = useAuthSession()

async function submit() {
  error.value = null
  const { error: err } = useBackupCode.value
    ? await authClient.twoFactor.verifyBackupCode({ code: code.value })
    : await authClient.twoFactor.verifyTotp({ code: code.value })
  if (err) {
    error.value = err.message ?? 'That code did not work.'
    return
  }
  await refresh()
  await navigateTo('/app')
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Two-factor authentication</CardTitle>
      <CardDescription>
        {{ useBackupCode ? 'Enter one of your backup codes.' : 'Enter the 6-digit code from your authenticator app.' }}
      </CardDescription>
    </CardHeader>
    <CardContent>
      <form class="grid gap-4" @submit.prevent="submit">
        <div class="grid gap-2">
          <Label for="code">Code</Label>
          <Input id="code" v-model="code" class="num" autocomplete="one-time-code" required />
        </div>
        <FormError :message="error" />
        <Button type="submit">Verify</Button>
        <Button type="button" variant="link" @click="useBackupCode = !useBackupCode">
          {{ useBackupCode ? 'Use an authenticator code' : 'Use a backup code' }}
        </Button>
      </form>
    </CardContent>
  </Card>
</template>
