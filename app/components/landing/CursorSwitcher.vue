<script setup lang="ts">
import { BLOCKED_REASON_LABEL, type CursorEffectsBlockedReason } from '~/lib/cursor-effects/motion'
import { CURSOR_CHOICES, type CursorChoice } from '~/lib/cursor-effects/selection'

defineProps<{
  choice: CursorChoice
  blockedReason: CursorEffectsBlockedReason | null
}>()

const emit = defineEmits<{ select: [choice: CursorChoice] }>()

const label = (choice: CursorChoice) => choice.charAt(0).toUpperCase() + choice.slice(1)
</script>

<template>
  <div class="flex flex-col items-center gap-1">
    <div
      role="group"
      aria-label="Cursor effect"
      class="flex flex-wrap items-center justify-center gap-0.5 rounded-full border border-border bg-card/80 p-1"
    >
      <button
        v-for="option in CURSOR_CHOICES"
        :key="option"
        type="button"
        :aria-pressed="choice === option"
        :disabled="blockedReason !== null"
        class="rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        :class="
          choice === option
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        "
        @click="emit('select', option)"
      >
        {{ label(option) }}
      </button>
    </div>
    <p v-if="blockedReason" class="text-xs text-muted-foreground" role="status">
      {{ BLOCKED_REASON_LABEL[blockedReason] }}
    </p>
  </div>
</template>
