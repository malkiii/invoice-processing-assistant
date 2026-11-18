import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['server/**/*.test.ts', 'tests/unit/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/support/fail-on-ai-sdk-deprecations.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/support/fail-on-ai-sdk-deprecations.ts'],
          testTimeout: 60_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
})
