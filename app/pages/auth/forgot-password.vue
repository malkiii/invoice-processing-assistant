<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

definePageMeta({ layout: 'auth', middleware: 'guest' })
useHead({ title: 'Forgot password' })

const { data: methods } = await useFetch('/api/auth-methods')
const email = ref('')
const sent = ref(false)
const error = ref<string | null>(null)

async function submit() {
  error.value = null
  const { error: err } = await authClient.requestPasswordReset({
    email: email.value,
    redirectTo: '/auth/reset-password',
  })
  if (err) error.value = err.message ?? 'Could not send the reset email.'
  else sent.value = true
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Reset your password</CardTitle>
      <CardDescription>We will email you a link to choose a new password.</CardDescription>
    </CardHeader>
    <CardContent>
      <p v-if="!methods?.passwordReset" class="text-sm text-muted-foreground">
        Email is not configured on this instance. Ask your Admin to reset your password.
      </p>
      <p v-else-if="sent" class="text-sm">If an account exists for {{ email }}, a reset link is on its way.</p>
      <form v-else class="grid gap-4" @submit.prevent="submit">
        <div class="grid gap-2">
          <Label for="email">Email</Label>
          <Input id="email" v-model="email" type="email" autocomplete="email" required />
        </div>
        <FormError :message="error" />
        <Button type="submit">Send reset link</Button>
      </form>
      <NuxtLink to="/auth/sign-in" class="mt-4 block text-sm text-muted-foreground underline">Back to sign in</NuxtLink>
    </CardContent>
  </Card>
</template>
