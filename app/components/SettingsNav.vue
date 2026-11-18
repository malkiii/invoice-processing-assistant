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
  <nav class="-mx-4 flex gap-1 overflow-x-auto border-b px-4 md:mx-0 md:px-0" aria-label="Settings">
    <NuxtLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="-mb-px shrink-0 border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground"
      active-class="!border-primary !text-foreground"
    >
      {{ item.label }}
    </NuxtLink>
  </nav>
</template>
