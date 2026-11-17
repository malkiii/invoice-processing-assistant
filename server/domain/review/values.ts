/**
 * Raw Values overlaid with Corrected Values (GLOSSARY "Corrected Values"). Corrected Values are
 * stored as a flat map from Field path to value, so each Field can be marked and reverted alone:
 *
 *   `total`                  a top-level scalar
 *   `vendor.name`            a scalar inside a group (`object`)
 *   `line_items.1.amount`    a scalar inside one item of a repeating group (`list`)
 *
 * Raw Values are never mutated. Everything that shows or exports values uses `mergeInvoiceValues`.
 */
import { isGroupField, type Field, type InvoiceValues } from '../template/fields'

export type CorrectedValues = Record<string, unknown>

export class FieldCorrectionError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The values a User sees and exports: Raw Values with every Corrected Value applied. */
export function mergeInvoiceValues(raw: InvoiceValues, corrected: CorrectedValues): InvoiceValues {
  const merged: InvoiceValues = structuredClone(raw)
  for (const [path, value] of Object.entries(corrected)) {
    const segments = path.split('.')
    let target: Record<string, unknown> | unknown[] = merged
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i]!
      const nextIsIndex = /^\d+$/.test(segments[i + 1]!)
      const container = target as Record<string, unknown>
      let child = container[segment]
      if (nextIsIndex ? !Array.isArray(child) : !isRecord(child)) {
        child = nextIsIndex ? [] : {}
        container[segment] = child
      }
      target = child as Record<string, unknown> | unknown[]
    }
    ;(target as Record<string, unknown>)[segments.at(-1)!] = structuredClone(value)
  }
  return merged
}

/** The value at a Field path in a values object, or undefined when absent. */
export function valueAtPath(values: InvoiceValues, path: string): unknown {
  let current: unknown = values
  for (const segment of path.split('.')) {
    if (Array.isArray(current) && /^\d+$/.test(segment)) current = current[Number(segment)]
    else if (isRecord(current)) current = current[segment]
    else return undefined
  }
  return current
}

/** Finds the scalar Field a path points at, or throws when the path does not name one. */
export function fieldAtPath(fields: Field[], raw: InvoiceValues, path: string): Field {
  const [key, second, third, ...rest] = path.split('.')
  const field = fields.find((f) => f.key === key)
  if (!field) throw new FieldCorrectionError(`Unknown Field “${path}”.`)
  if (!isGroupField(field)) {
    if (second !== undefined) throw new FieldCorrectionError(`Unknown Field “${path}”.`)
    return field
  }
  let childKey = second
  if (field.type === 'list') {
    const items = raw[field.key]
    if (second === undefined || !/^\d+$/.test(second) || !Array.isArray(items) || Number(second) >= items.length) {
      throw new FieldCorrectionError(`“${path}” is not an existing ${field.label} item.`)
    }
    childKey = third
  } else if (third !== undefined) {
    throw new FieldCorrectionError(`Unknown Field “${path}”.`)
  }
  const child = field.fields.find((f) => f.key === childKey)
  if (!child || isGroupField(child) || rest.length > 0) throw new FieldCorrectionError(`Unknown Field “${path}”.`)
  return child
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function assertValueFits(field: Field, value: unknown, path: string) {
  if (value === null) return
  const fail = (expected: string) => {
    throw new FieldCorrectionError(`“${field.label}” (${path}) must be ${expected}.`)
  }
  switch (field.type) {
    case 'text':
      if (typeof value !== 'string') fail('text')
      break
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) fail('a number')
      break
    case 'boolean':
      if (typeof value !== 'boolean') fail('true or false')
      break
    case 'date':
      if (typeof value !== 'string' || !ISO_DATE.test(value) || Number.isNaN(Date.parse(value))) fail('a date (YYYY-MM-DD)')
      break
    case 'enum':
      if (typeof value !== 'string' || !field.choices.includes(value)) fail(`one of ${field.choices.join(', ')}`)
      break
    case 'money': {
      const ok =
        isRecord(value) &&
        (value.amount === null || (typeof value.amount === 'number' && Number.isFinite(value.amount))) &&
        (value.currency === null || typeof value.currency === 'string')
      if (!ok) fail('an amount and a currency')
      break
    }
    default:
      fail('a single value')
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/**
 * Returns new Corrected Values with the Field at `path` set to `value`. `undefined` reverts the
 * Field to its Raw Value, and so does a value equal to the Raw Value. Throws FieldCorrectionError
 * when the path is not a scalar Field of the Template Snapshot or the value does not fit its type.
 */
export function applyCorrection(
  fields: Field[],
  raw: InvoiceValues,
  corrected: CorrectedValues,
  path: string,
  value: unknown,
): CorrectedValues {
  const field = fieldAtPath(fields, raw, path)
  const next = { ...corrected }
  if (value === undefined || sameValue(value, valueAtPath(raw, path))) {
    delete next[path]
    return next
  }
  assertValueFits(field, value, path)
  next[path] = value
  return next
}
