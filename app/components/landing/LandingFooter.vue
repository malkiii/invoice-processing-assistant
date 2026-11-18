<template>
  <footer class="border-t border-border">
    <div class="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div class="flex items-center gap-2">
        <span class="num rounded-sm bg-primary px-1.5 text-primary-foreground">{ }</span>
        <span>Invoice Processing Assistant. Self-hosted, bring your own LLM.</span>
      </div>
      <div class="flex gap-5">
        <NuxtLink to="/auth/sign-in" class="hover:text-foreground">Sign in</NuxtLink>
        <NuxtLink to="/auth/sign-up" class="hover:text-foreground">Create account</NuxtLink>
      </div>
    </div>
  </footer>
</template>
