<script setup lang="ts">
const items = [
  { label: 'Profile', to: '/app/settings/profile' },
  { label: 'Security', to: '/app/settings/security' },
  { label: 'Providers', to: '/app/settings/providers' },
  { label: 'Sources', to: '/app/settings/sources' },
  { label: 'Preferences', to: '/app/settings/preferences' },
]
</script>

<template>
  <nav class="flex gap-1 border-b" aria-label="Settings">
    <NuxtLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
      active-class="!border-primary !text-foreground"
    >
      {{ item.label }}
    </NuxtLink>
  </nav>
</template>
