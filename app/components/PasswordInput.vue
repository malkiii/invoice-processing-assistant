<script setup lang="ts">
import { Eye, EyeOff } from '@lucide/vue'
import { Input } from '@/components/ui/input'

/** A password field with a button that shows or hides what was typed. */
defineOptions({ inheritAttrs: false })
const model = defineModel<string>({ required: true })
const visible = ref(false)
</script>

<template>
  <div class="relative">
    <Input v-model="model" v-bind="$attrs" :type="visible ? 'text' : 'password'" class="pr-10" />
    <button
      type="button"
      class="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
      :aria-label="visible ? 'Hide password' : 'Show password'"
      :aria-pressed="visible"
      @click="visible = !visible"
    >
      <EyeOff v-if="visible" class="size-4" />
      <Eye v-else class="size-4" />
    </button>
  </div>
</template>
