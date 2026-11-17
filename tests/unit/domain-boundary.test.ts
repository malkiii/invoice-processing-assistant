import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const domainDir = join(import.meta.dirname, '../../server/domain')

// server/domain must stay framework-free so the worker can run it without Nuxt.
const forbidden = [
  /^nuxt(\/|$)/,
  /^#/, // Nuxt/Nitro virtual modules: #imports, #app, #internal/...
  /^nitropack(\/|$)/,
  /^nitro(\/|$)/,
  /^h3$/,
  /^@nuxt\//,
  /^~~?\//,
  /^@@?\//,
]

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|mts|js|mjs)$/.test(entry.name) ? [path] : []
  })
}

function importSpecifiers(source: string): string[] {
  const pattern = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g
  return [...source.matchAll(pattern)].map((m) => m[1] ?? m[2] ?? m[3]!)
}

describe('server/domain', () => {
  it('does not import Nuxt, Nitro or their aliases', () => {
    const violations = sourceFiles(domainDir).flatMap((file) =>
      importSpecifiers(readFileSync(file, 'utf8'))
        .filter((spec) => forbidden.some((re) => re.test(spec)))
        .map((spec) => `${relative(domainDir, file)} imports "${spec}"`),
    )
    expect(violations).toEqual([])
  })

  it('detects a forbidden import (guards the guard)', () => {
    const specs = importSpecifiers(
      `import { x } from '#imports'\nimport type { H3Event } from 'h3'\nconst m = await import('nuxt/app')\nimport './ok'`,
    )
    expect(specs.filter((spec) => forbidden.some((re) => re.test(spec)))).toEqual([
      '#imports',
      'h3',
      'nuxt/app',
    ])
  })
})
