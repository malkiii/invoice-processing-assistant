<script setup lang="ts">
import LandingPage from '~/components/landing/LandingPage.vue'

// Signed-in Users go straight to the app; the landing page stays reachable at /home.
definePageMeta({ middleware: 'guest' })
useHead({ title: 'Invoice Processing Assistant' })
</script>

<template>
  <LandingPage />
</template>
