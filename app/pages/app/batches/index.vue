<script setup lang="ts">
definePageMeta({ layout: 'app', middleware: 'auth' })
useHead({ title: 'Batches' })

const { data: batches } = await useFetch('/api/batches', { default: () => [] })
</script>

<template>
  <div class="grid gap-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold">Batches</h1>
      <NuxtLink to="/app/intake" class="text-sm underline">Add Documents</NuxtLink>
    </div>
    <p v-if="!batches.length" class="text-sm text-muted-foreground">No Batches yet.</p>
    <table v-else class="w-full text-sm">
      <thead class="text-left text-muted-foreground">
        <tr>
          <th class="py-2 font-normal">Added</th>
          <th class="py-2 font-normal">Source</th>
          <th class="py-2 text-right font-normal">Documents</th>
          <th class="py-2 font-normal">Status</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="b in batches" :key="b.id" class="border-t">
          <td class="py-2">
            <NuxtLink :to="`/app/batches/${b.id}`" class="underline">{{ formatDateTime(b.createdAt) }}</NuxtLink>
          </td>
          <td class="py-2">{{ b.source }}</td>
          <td class="num py-2 text-right">{{ b.documentCount }}</td>
          <td class="flex flex-wrap gap-1 py-2">
            <span v-for="(n, status) in b.statusCounts" :key="status" class="inline-flex items-center gap-1">
              <DocumentStatusBadge :status="status" /> <span class="num text-xs">{{ n }}</span>
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
