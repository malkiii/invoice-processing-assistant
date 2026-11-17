<script setup lang="ts">
definePageMeta({ layout: 'app', middleware: 'auth' })
useHead({ title: 'Documents' })

const { data: documents } = await useFetch('/api/documents', { default: () => [] })
</script>

<template>
  <div class="grid gap-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold">Documents</h1>
      <NuxtLink to="/app/intake" class="text-sm underline">Add Documents</NuxtLink>
    </div>
    <p v-if="!documents.length" class="text-sm text-muted-foreground">No Documents yet.</p>
    <table v-else class="w-full text-sm">
      <thead class="text-left text-muted-foreground">
        <tr>
          <th class="py-2 font-normal">Document</th>
          <th class="py-2 font-normal">Added</th>
          <th class="py-2 font-normal">Format</th>
          <th class="py-2 text-right font-normal">Size</th>
          <th class="py-2 font-normal">Status</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="d in documents" :key="d.id" class="border-t align-top">
          <td class="py-2">
            <NuxtLink :to="`/app/documents/${d.id}`" class="underline">{{ d.name }}</NuxtLink>
            <p v-if="d.failureReason" class="text-xs text-destructive">{{ d.failureReason }}</p>
          </td>
          <td class="py-2">
            <NuxtLink :to="`/app/batches/${d.batchId}`" class="text-muted-foreground underline">{{ formatDateTime(d.createdAt) }}</NuxtLink>
          </td>
          <td class="py-2 uppercase">{{ d.format ?? '—' }}</td>
          <td class="num py-2 text-right">{{ formatBytes(d.sizeBytes) }}</td>
          <td class="py-2"><DocumentStatusBadge :status="d.status" :reason="d.failureReason" /></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
