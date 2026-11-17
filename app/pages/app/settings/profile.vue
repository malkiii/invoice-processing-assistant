<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

definePageMeta({ layout: 'app', middleware: 'auth' })
useHead({ title: 'Profile' })

const { user, refresh } = useAuthSession()
const name = ref(user.value?.name ?? '')
const saved = ref(false)
const error = ref<string | null>(null)

async function save() {
  saved.value = false
  error.value = null
  const { error: err } = await authClient.updateUser({ name: name.value })
  if (err) {
    error.value = err.message ?? 'Could not save your profile.'
    return
  }
  await refresh()
  saved.value = true
}
</script>

<template>
  <div class="grid max-w-2xl gap-6">
    <h1 class="text-2xl font-semibold">Settings</h1>
    <SettingsNav />
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          Signed in as {{ user?.email }}<template v-if="user?.role === 'admin'"> · Admin</template>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form class="grid gap-4" @submit.prevent="save">
          <div class="grid gap-2">
            <Label for="name">Name</Label>
            <Input id="name" v-model="name" required />
          </div>
          <FormError :message="error" />
          <div class="flex items-center gap-3">
            <Button type="submit">Save</Button>
            <span v-if="saved" class="text-sm text-muted-foreground">Saved.</span>
          </div>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
