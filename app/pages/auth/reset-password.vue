<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

definePageMeta({ layout: 'auth' })
useHead({ title: 'Choose a new password' })

const route = useRoute()
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : null))
const password = ref('')
const error = ref<string | null>(
  route.query.error ? 'This reset link is invalid or has expired.' : null,
)

async function submit() {
  if (!token.value) return
  error.value = null
  const { error: err } = await authClient.resetPassword({ newPassword: password.value, token: token.value })
  if (err) {
    error.value = err.message ?? 'Could not reset the password.'
    return
  }
  await navigateTo('/auth/sign-in')
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Choose a new password</CardTitle>
      <CardDescription>After saving you can sign in with it.</CardDescription>
    </CardHeader>
    <CardContent>
      <form v-if="token" class="grid gap-4" @submit.prevent="submit">
        <div class="grid gap-2">
          <Label for="password">New password</Label>
          <Input id="password" v-model="password" type="password" autocomplete="new-password" minlength="8" required />
        </div>
        <FormError :message="error" />
        <Button type="submit">Save password</Button>
      </form>
      <div v-else class="grid gap-4">
        <FormError :message="error ?? 'This reset link is missing its token.'" />
        <NuxtLink to="/auth/forgot-password" class="text-sm underline">Request a new link</NuxtLink>
      </div>
    </CardContent>
  </Card>
</template>
