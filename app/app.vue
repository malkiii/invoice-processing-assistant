<script setup lang="ts">
const { theme } = useTheme()
const route = useRoute()

// The landing page is dark-only; everything else follows the chosen theme.
useHead({
  htmlAttrs: { 'data-theme': computed(() => (route.path === '/' ? 'noir' : theme.value)) },
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
