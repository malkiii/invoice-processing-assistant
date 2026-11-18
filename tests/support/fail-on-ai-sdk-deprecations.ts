/**
 * Vitest setup: any AI SDK deprecation warning raised during a test fails that test, so a
 * deprecated API is caught here after an SDK upgrade instead of in the worker's logs.
 * Other AI SDK warnings (e.g. a provider ignoring a setting) are still printed, not failed.
 */
import type { LogWarningsFunction } from 'ai'
import { afterEach } from 'vitest'

const deprecations: string[] = []

const logWarnings: LogWarningsFunction = ({ warnings, provider, model }) => {
  for (const warning of warnings) {
    if (warning.type === 'deprecated') {
      deprecations.push(`${warning.setting}: ${warning.message}`)
    } else {
      console.warn('AI SDK warning', { provider, model, warning })
    }
  }
}

globalThis.AI_SDK_LOG_WARNINGS = logWarnings

afterEach(() => {
  if (deprecations.length === 0) return
  const found = [...new Set(deprecations.splice(0))]
  throw new Error(`AI SDK deprecation warning(s) raised; migrate to the replacement API:\n- ${found.join('\n- ')}`)
})
