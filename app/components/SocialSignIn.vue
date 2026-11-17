<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import { Button } from '@/components/ui/button'

const props = defineProps<{ callbackURL: string }>()
const { data: methods } = await useFetch('/api/auth-methods')

async function signIn(provider: 'google' | 'github') {
  await authClient.signIn.social({ provider, callbackURL: props.callbackURL })
}
</script>

<template>
  <div v-if="methods?.google || methods?.github" class="grid gap-2">
    <div class="flex items-center gap-3 text-xs text-muted-foreground">
      <span class="h-px flex-1 bg-border" /> or <span class="h-px flex-1 bg-border" />
    </div>
    <Button v-if="methods.google" variant="outline" type="button" @click="signIn('google')">
      Continue with Google
    </Button>
    <Button v-if="methods.github" variant="outline" type="button" @click="signIn('github')">
      Continue with GitHub
    </Button>
  </div>
</template>
