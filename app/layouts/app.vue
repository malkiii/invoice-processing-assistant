<script setup lang="ts">
import { Download, FileText, LayoutDashboard, Layers, LayoutTemplate, LogOut, Moon, Settings, ShieldCheck, Sun, Upload, UserRound } from '@lucide/vue'
import { authClient } from '~/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

const { user, refresh } = useAuthSession()
const { theme, toggle } = useTheme()
const downloadsOpen = ref(false)

// Later features add their entries here (Intake, Batches, Documents, Invoices, Templates).
const nav = computed(() => [
  { label: 'Dashboard', to: '/app', icon: LayoutDashboard, exact: true },
  { label: 'Intake', to: '/app/intake', icon: Upload, exact: false },
  { label: 'Batches', to: '/app/batches', icon: Layers, exact: false },
  { label: 'Documents', to: '/app/documents', icon: FileText, exact: false },
  { label: 'Templates', to: '/app/templates', icon: LayoutTemplate, exact: false },
  { label: 'Settings', to: '/app/settings/profile', icon: Settings, exact: false },
  ...(user.value?.role === 'admin' ? [{ label: 'Admin', to: '/admin', icon: ShieldCheck, exact: false }] : []),
])

async function signOut() {
  await authClient.signOut()
  await refresh()
  await navigateTo('/auth/sign-in')
}
</script>

<template>
  <div class="flex min-h-svh">
    <aside class="hidden w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
      <NuxtLink to="/app" class="flex h-14 items-center gap-2 px-4 text-sm font-semibold">
        <span class="size-2.5 rounded-full bg-primary" aria-hidden="true" />
        Invoice Assistant
      </NuxtLink>
      <nav class="grid gap-1 px-2 py-2" aria-label="Main">
        <NuxtLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          :exact-active-class="item.exact ? '!bg-sidebar-accent !text-sidebar-accent-foreground' : undefined"
          :active-class="item.exact ? undefined : '!bg-sidebar-accent !text-sidebar-accent-foreground'"
        >
          <component :is="item.icon" class="size-4" />
          {{ item.label }}
        </NuxtLink>
      </nav>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-14 items-center gap-2 border-b px-4">
        <div class="flex-1" />
        <Button variant="ghost" size="icon" :aria-label="`Switch to Ledger ${theme === 'noir' ? 'Day' : 'Noir'}`" @click="toggle">
          <Sun v-if="theme === 'noir'" class="size-4" />
          <Moon v-else class="size-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Downloads" @click="downloadsOpen = true">
          <Download class="size-4" />
        </Button>
        <div class="flex items-center gap-2 pl-2 text-sm">
          <UserRound class="size-4 text-muted-foreground" />
          <span data-testid="user-email">{{ user?.email }}</span>
          <span v-if="user?.role === 'admin'" class="inline-flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-xs text-primary">
            <ShieldCheck class="size-3" /> Admin
          </span>
        </div>
        <Button variant="ghost" size="sm" @click="signOut">
          <LogOut class="size-4" /> Sign out
        </Button>
      </header>
      <ProviderBrokenBanner />

      <main class="flex-1 p-6">
        <slot />
      </main>
    </div>

    <Sheet v-model:open="downloadsOpen">
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Downloads</SheetTitle>
          <SheetDescription>Your past Exports appear here.</SheetDescription>
        </SheetHeader>
        <p class="px-4 text-sm text-muted-foreground">No Exports yet.</p>
      </SheetContent>
    </Sheet>
  </div>
</template>
