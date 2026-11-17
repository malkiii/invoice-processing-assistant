import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The Admin must never see Documents, Invoices or Provider Connection data
 * (spec "Users and access"). Admin code may only reach the account, instance
 * and invite tables; any other table (or the schema barrel that re-exports all
 * of them) is off limits. Response shapes are pinned in the integration test.
 */
const root = join(import.meta.dirname, '../..')
const adminSources = ['server/admin', 'server/api/admin', 'server/utils/admin.ts', 'app/pages/admin']
const allowedSchemaModules = ['auth', 'instance', 'invites']

function sourceFiles(path: string): string[] {
  if (!existsSync(path)) return []
  if (/\.(ts|mts|vue)$/.test(path)) return [path]
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => sourceFiles(join(path, entry.name)))
}

function importSpecifiers(source: string): string[] {
  const pattern = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  return [...source.matchAll(pattern)].map((m) => m[1] ?? m[2]!)
}

function forbiddenAdminImport(specifier: string, source: string): string | null {
  const schema = /(?:^|\/)db\/schema(?:\/([\w-]+))?$/.exec(specifier) ?? /^\.\/schema(?:\/([\w-]+))?$/.exec(specifier)
  if (schema && !allowedSchemaModules.includes(schema[1] ?? '')) return specifier
  // Data-access helpers for User-owned data are off limits too.
  if (/\b(documents?|invoices?|extractions?|provider[-_]?connections?|providers?|templates?|batch(es)?)\b/i.test(specifier)) {
    return specifier
  }
  // Nuxt auto-imports bypass import statements: forbid composables for User data.
  const autoImport = /\buse(Documents?|Invoices?|Providers?|ProviderConnections?)\b/.exec(source)
  return autoImport ? autoImport[0] : null
}

describe('admin code', () => {
  it('reaches only account, instance and invite data', () => {
    const violations = adminSources
      .flatMap((path) => sourceFiles(join(root, path)))
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8')
        return importSpecifiers(source)
          .map((spec) => forbiddenAdminImport(spec, ''))
          .concat(forbiddenAdminImport('', source))
          .filter((hit): hit is string => hit !== null)
          .map((hit) => `${relative(root, file)}: ${hit}`)
      })
    expect(violations).toEqual([])
  })

  it('wraps every /api/admin route in defineAdminHandler (the middleware guards them too)', () => {
    const routes = sourceFiles(join(root, 'server/api/admin'))
    expect(routes.length).toBeGreaterThan(0)
    const unwrapped = routes
      .filter((file) => !/export default defineAdminHandler\(/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file))
    expect(unwrapped).toEqual([])
  })

  it('detects forbidden imports (guards the guard)', () => {
    expect(forbiddenAdminImport('../db/schema', '')).not.toBeNull()
    expect(forbiddenAdminImport('../../db/schema/documents', '')).not.toBeNull()
    expect(forbiddenAdminImport('../db/provider-connections', '')).not.toBeNull()
    expect(forbiddenAdminImport('', 'const x = useDocuments()')).not.toBeNull()
    expect(forbiddenAdminImport('../db/schema/auth', '')).toBeNull()
    expect(forbiddenAdminImport('../db/invites', '')).toBeNull()
  })
})
