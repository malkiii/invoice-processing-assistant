<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

definePageMeta({ layout: 'auth', middleware: 'guest' })
useHead({ title: 'Sign in' })

const route = useRoute()
const redirect = computed(() => {
  const target = typeof route.query.redirect === 'string' ? route.query.redirect : '/app'
  return target.startsWith('/') && !target.startsWith('//') ? target : '/app'
})

const form = reactive({ email: '', password: '' })
const error = ref<string | null>(null)
const pending = ref(false)
const { refresh } = useAuthSession()

async function submit() {
  pending.value = true
  error.value = null
  const { data, error: err } = await authClient.signIn.email(form)
  pending.value = false
  if (err) {
    error.value = err.message ?? 'Sign-in failed.'
    return
  }
  // With 2FA enabled the client plugin redirects to /auth/two-factor instead.
  if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) return
  await refresh()
  await navigateTo(redirect.value)
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Sign in</CardTitle>
      <CardDescription>Welcome back.</CardDescription>
    </CardHeader>
    <CardContent>
      <form class="grid gap-4" @submit.prevent="submit">
        <div class="grid gap-2">
          <Label for="email">Email</Label>
          <Input id="email" v-model="form.email" type="email" autocomplete="email" required />
        </div>
        <div class="grid gap-2">
          <div class="flex items-center justify-between">
            <Label for="password">Password</Label>
            <NuxtLink to="/auth/forgot-password" class="text-xs text-muted-foreground underline">Forgot password?</NuxtLink>
          </div>
          <Input id="password" v-model="form.password" type="password" autocomplete="current-password" required />
        </div>
        <FormError :message="error" />
        <Button type="submit" :disabled="pending">Sign in</Button>
      </form>
    </CardContent>
    <CardFooter class="flex-col gap-4">
      <SocialSignIn :callback-u-r-l="redirect" class="w-full" />
      <p class="text-sm text-muted-foreground">
        No account yet? <NuxtLink to="/auth/sign-up" class="text-foreground underline">Sign up</NuxtLink>
      </p>
    </CardFooter>
  </Card>
</template>
