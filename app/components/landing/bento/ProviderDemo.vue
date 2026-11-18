<script setup lang="ts">
import { LoaderCircle, Lock } from '@lucide/vue'
import { providers } from '~/lib/landing/content'

/** Pick a provider and "test" a connection. Purely visual: no request is made. */
const selected = ref(0)
const state = ref<'idle' | 'testing' | 'ok'>('idle')
let timer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(timer))

const current = computed(() => providers[selected.value]!)
const baseUrl = computed(() =>
  current.value.name === 'Ollama' ? 'http://localhost:11434' : current.value.name === 'OpenAI-compatible' ? 'https://llm.internal/v1' : null,
)

function pick(i: number) {
  selected.value = i
  state.value = 'idle'
  clearTimeout(timer)
}
function test() {
  state.value = 'testing'
  clearTimeout(timer)
  timer = setTimeout(() => (state.value = 'ok'), 1100)
}
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Provider">
      <button
        v-for="(p, i) in providers"
        :key="p.name"
        type="button"
        role="radio"
        :aria-checked="selected === i"
        class="rounded-full border px-2.5 py-1 text-xs transition-all duration-200"
        :class="selected === i ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground'"
        @click="pick(i)"
      >
        {{ p.name }}
      </button>
    </div>

    <Transition name="b-conn" mode="out-in">
      <div :key="current.name" class="flex flex-1 flex-col gap-3 rounded-xl border border-border bg-background/60 p-4">
        <div class="flex items-center justify-between">
          <p class="font-semibold">{{ current.name }}</p>
          <span class="num rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{{ current.note }}</span>
        </div>
        <label v-if="baseUrl" class="grid gap-1 text-[11px] text-muted-foreground">
          Base URL
          <span class="num rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground">{{ baseUrl }}</span>
        </label>
        <label class="grid gap-1 text-[11px] text-muted-foreground">
          API key
          <span class="num flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground">
            <Lock class="size-3 text-primary" /> <span class="b-mask">••••••••••••3f9a</span>
          </span>
        </label>
        <p class="text-[11px] text-muted-foreground">Encrypted at rest. Only ever sent to {{ current.name }}.</p>
        <div class="mt-auto flex items-center gap-3">
          <button
            type="button"
            class="rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
            :disabled="state === 'testing'"
            @click="test"
          >
            Test connection
          </button>
          <span class="num flex items-center gap-1.5 text-xs">
            <template v-if="state === 'testing'"><LoaderCircle class="size-3.5 animate-spin" /> testing…</template>
            <template v-else-if="state === 'ok'"><span class="b-ping relative size-2 rounded-full bg-primary" /> connected</template>
          </span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.b-conn-enter-active, .b-conn-leave-active { transition: all 0.3s ease; }
.b-conn-enter-from { opacity: 0; transform: translateY(10px); filter: blur(4px); }
.b-conn-leave-to { opacity: 0; transform: translateY(-10px); filter: blur(4px); }
.b-mask { animation: b-type 0.8s steps(16) both; display: inline-block; overflow: hidden; white-space: nowrap; }
@keyframes b-type { from { max-width: 0; } to { max-width: 16ch; } }
.b-ping::after {
  content: ''; position: absolute; inset: 0; border-radius: 9999px; background: var(--primary);
  animation: b-ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;
}
@keyframes b-ping { 75%, 100% { transform: scale(3); opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .b-conn-enter-active, .b-conn-leave-active { transition: none; }
  .b-mask, .b-ping::after { animation: none; }
}
</style>
