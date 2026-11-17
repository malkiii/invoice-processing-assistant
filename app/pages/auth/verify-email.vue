<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

definePageMeta({ layout: 'auth' })
useHead({ title: 'Verify your email' })

const route = useRoute()
const email = computed(() => (typeof route.query.email === 'string' ? route.query.email : ''))
const failed = computed(() => Boolean(route.query.error))
const resent = ref(false)
const error = ref<string | null>(null)

async function resend() {
  error.value = null
  const { error: err } = await authClient.sendVerificationEmail({ email: email.value, callbackURL: '/app' })
  if (err) error.value = err.message ?? 'Could not resend the email.'
  else resent.value = true
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>{{ failed ? 'Verification failed' : 'Check your inbox' }}</CardTitle>
      <CardDescription>
        <template v-if="failed">The verification link is invalid or has expired.</template>
        <template v-else>We sent a verification link{{ email ? ` to ${email}` : '' }}. Open it to finish signing up.</template>
      </CardDescription>
    </CardHeader>
    <CardContent class="grid gap-4">
      <FormError :message="error" />
      <p v-if="resent" class="text-sm">A new link is on its way.</p>
      <Button v-else-if="email" variant="outline" @click="resend">Resend the email</Button>
      <NuxtLink to="/auth/sign-in" class="text-sm text-muted-foreground underline">Back to sign in</NuxtLink>
    </CardContent>
  </Card>
</template>
