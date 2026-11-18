<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

definePageMeta({ layout: 'auth', middleware: 'guest' })
useHead({ title: 'Sign up' })

// An Admin's invite link carries `?invite=<token>&email=<address>`.
const route = useRoute()
const inviteToken = typeof route.query.invite === 'string' ? route.query.invite : undefined
const invitedEmail = typeof route.query.email === 'string' ? route.query.email : ''

const form = reactive({ name: '', email: invitedEmail, password: '' })
const confirmPassword = ref('')
const mismatch = computed(() => confirmPassword.value !== '' && confirmPassword.value !== form.password)
const error = ref<string | null>(null)
const pending = ref(false)
const { refresh } = useAuthSession()

async function submit() {
  if (form.password !== confirmPassword.value) {
    error.value = 'The passwords do not match.'
    return
  }
  pending.value = true
  error.value = null
  // `inviteToken` is read by the server's sign-up hook; it is not a Better Auth field.
  const body = { ...form, inviteToken, callbackURL: '/app' }
  const { data, error: err } = await authClient.signUp.email(body)
  pending.value = false
  if (err) {
    error.value = err.message ?? 'Sign-up failed.'
    return
  }
  // Without a session token the instance requires email verification first.
  if (!data?.token) {
    return navigateTo({ path: '/auth/verify-email', query: { email: form.email } })
  }
  await refresh()
  await navigateTo('/app')
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Create your account</CardTitle>
      <CardDescription v-if="inviteToken">You've been invited. Create your account with the invited email.</CardDescription>
      <CardDescription v-else>The first account on a new instance becomes its Admin.</CardDescription>
    </CardHeader>
    <CardContent>
      <form class="grid gap-4" @submit.prevent="submit">
        <div class="grid gap-2">
          <Label for="name">Name</Label>
          <Input id="name" v-model="form.name" autocomplete="name" required />
        </div>
        <div class="grid gap-2">
          <Label for="email">Email</Label>
          <Input id="email" v-model="form.email" type="email" autocomplete="email" required />
        </div>
        <div class="grid gap-2">
          <Label for="password">Password</Label>
          <PasswordInput id="password" v-model="form.password" autocomplete="new-password" minlength="8" required />
        </div>
        <div class="grid gap-2">
          <Label for="confirm-password">Confirm password</Label>
          <PasswordInput
            id="confirm-password"
            v-model="confirmPassword"
            autocomplete="new-password"
            minlength="8"
            required
            :aria-invalid="mismatch || undefined"
            aria-describedby="confirm-password-hint"
          />
          <p v-if="mismatch" id="confirm-password-hint" class="text-xs text-destructive">The passwords do not match.</p>
        </div>
        <FormError :message="error" />
        <Button type="submit" :disabled="pending">Create account</Button>
      </form>
    </CardContent>
    <CardFooter class="flex-col gap-4">
      <SocialSignIn callback-u-r-l="/app" class="w-full" />
      <p class="text-sm text-muted-foreground">
        Already have an account? <NuxtLink to="/auth/sign-in" class="text-foreground underline">Sign in</NuxtLink>
      </p>
    </CardFooter>
  </Card>
</template>
