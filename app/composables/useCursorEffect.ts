import { useMediaQuery } from '@vueuse/core'
import {
  COARSE_POINTER_QUERY,
  REDUCED_MOTION_QUERY,
  cursorEffectsBlockedReason,
} from '~/lib/cursor-effects/motion'
import {
  CURSOR_STORAGE_KEY,
  isCursorChoice,
  resolveCursorEffect,
  type CursorChoice,
  type CursorEffectName,
} from '~/lib/cursor-effects/selection'

function readStored(): string | null {
  try {
    return localStorage.getItem(CURSOR_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStored(choice: CursorChoice) {
  try {
    localStorage.setItem(CURSOR_STORAGE_KEY, choice)
  } catch {
    // Storage blocked (private mode, disabled site data): the URL still carries the choice.
  }
}

/**
 * The landing page's cursor effect choice. `?cursor=` wins over the remembered choice.
 * `active` is null until the client has mounted and whenever effects must stay off,
 * so the server and reduced-motion/touch users always get the static hero.
 */
export function useCursorEffect() {
  const route = useRoute()
  const router = useRouter()

  const choice = ref<CursorChoice>(resolveCursorEffect({ query: route.query.cursor, stored: null }))
  const mounted = ref(false)
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY)
  const coarsePointer = useMediaQuery(COARSE_POINTER_QUERY)

  const blockedReason = computed(() =>
    mounted.value
      ? cursorEffectsBlockedReason({ reducedMotion: reducedMotion.value, coarsePointer: coarsePointer.value })
      : null,
  )

  const active = computed<CursorEffectName | null>(() => {
    if (!mounted.value || blockedReason.value || choice.value === 'off') return null
    return choice.value
  })

  onMounted(() => {
    choice.value = resolveCursorEffect({ query: route.query.cursor, stored: readStored() })
    mounted.value = true
  })

  // Back/forward navigation changes the query without a click on the switcher.
  watch(
    () => route.query.cursor,
    (query) => {
      const next = Array.isArray(query) ? query[0] : query
      if (isCursorChoice(next)) choice.value = next
    },
  )

  function select(next: CursorChoice) {
    choice.value = next
    writeStored(next)
    router.replace({ query: { ...route.query, cursor: next } })
  }

  return { choice: readonly(choice), active, blockedReason, select }
}
