import { createEffectScope, type EffectScope } from '~/lib/cursor-effects/effect-scope'

/**
 * The shared mount/unmount contract for landing cursor effects: `setup` runs on mount
 * with a fresh scope, and every listener, frame loop and timer it registered is torn
 * down before the component unmounts.
 */
export function useCursorEffectScope(setup: (scope: EffectScope) => void) {
  let scope: EffectScope | undefined
  onMounted(() => {
    scope = createEffectScope()
    setup(scope)
  })
  onBeforeUnmount(() => scope?.dispose())
}
