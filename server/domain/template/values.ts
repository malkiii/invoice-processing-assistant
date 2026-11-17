import type { InvoiceValues } from './fields'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Raw Values overlaid with Corrected Values: what the User sees, checks and exports.
 * A corrected key replaces the raw one; a corrected group (object) is overlaid key by key on the
 * raw group; a corrected list replaces the raw list whole.
 */
export function mergeValues(raw: InvoiceValues, corrected: InvoiceValues | null | undefined): InvoiceValues {
  const merged: InvoiceValues = { ...raw }
  for (const [key, value] of Object.entries(corrected ?? {})) {
    const base = raw[key]
    merged[key] = isPlainObject(value) && isPlainObject(base) ? { ...base, ...value } : value
  }
  return merged
}
