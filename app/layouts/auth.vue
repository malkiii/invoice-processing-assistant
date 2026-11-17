<template>
  <div class="flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-12">
    <NuxtLink to="/" class="flex items-center gap-2 text-sm font-medium">
      <span class="size-2.5 rounded-full bg-primary" aria-hidden="true" />
      Invoice Processing Assistant
    </NuxtLink>
    <main class="w-full max-w-sm">
      <slot />
    </main>
  </div>
</template>
