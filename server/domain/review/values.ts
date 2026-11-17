/**
 * Recording Corrected Values one Field at a time (spec "Review"). Corrected Values have the shape
 * `mergeValues` (server/domain/template/values.ts) overlays on Raw Values: a corrected key
 * replaces the raw one, a corrected group is overlaid key by key, a corrected list replaces the
 * raw list whole. Raw Values are never mutated.
 *
 * Fields are addressed by path, in the same form Checks report them:
 *   `total`                  a top-level scalar
 *   `vendor.name`            a scalar inside a group (`object`)
 *   `line_items[1].amount`   a scalar inside one item of a repeating group (`list`)
 */
import { isGroupField, type Field, type InvoiceValues } from '../template/fields'
import { mergeValues } from '../template/values'

export class FieldCorrectionError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

type ParsedPath =
  | { kind: 'top'; field: Field; key: string }
  | { kind: 'group'; field: Field; key: string; child: string }
  | { kind: 'list'; field: Field; key: string; index: number; child: string }

const PATH = /^([a-z][a-z0-9_]*)(?:\[(\d+)\])?(?:\.([a-z][a-z0-9_]*))?$/

/** Resolves a path to the scalar Field it names, given the current (merged) values. */
function parsePath(fields: Field[], merged: InvoiceValues, path: string): ParsedPath {
  const unknown = () => new FieldCorrectionError(`Unknown Field “${path}”.`)
  const match = PATH.exec(path)
  if (!match) throw unknown()
  const [, key, index, childKey] = match
  const top = fields.find((f) => f.key === key)
  if (!top) throw unknown()
  if (!isGroupField(top)) {
    if (index !== undefined || childKey !== undefined) throw unknown()
    return { kind: 'top', field: top, key: key! }
  }
  const child = top.fields.find((f) => f.key === childKey)
  if (!child || isGroupField(child)) throw unknown()
  if (top.type === 'object') {
    if (index !== undefined) throw unknown()
    return { kind: 'group', field: child, key: key!, child: childKey! }
  }
  const items = merged[key!]
  if (index === undefined || !Array.isArray(items) || Number(index) >= items.length) {
    throw new FieldCorrectionError(`“${path}” is not an existing ${top.label} item.`)
  }
  return { kind: 'list', field: child, key: key!, index: Number(index), child: childKey! }
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

/**
 * Returns new Corrected Values with the Field at `path` set to `value`. `undefined` reverts the
 * Field to its Raw Value; a value equal to the Raw Value does the same. Throws FieldCorrectionError
 * when the path is not a scalar Field of the Template Snapshot or the value does not fit its type.
 */
export function applyCorrection(
  fields: Field[],
  raw: InvoiceValues,
  corrected: InvoiceValues,
  path: string,
  value: unknown,
): InvoiceValues {
  const target = parsePath(fields, mergeValues(raw, corrected), path)
  if (value !== undefined) assertValueFits(target.field, value, path)
  const next: InvoiceValues = structuredClone(corrected)

  if (target.kind === 'top') {
    if (value === undefined || sameValue(value, raw[target.key])) delete next[target.key]
    else next[target.key] = value
    return next
  }

  if (target.kind === 'group') {
    const rawGroup = isRecord(raw[target.key]) ? (raw[target.key] as Record<string, unknown>) : {}
    const group = isRecord(next[target.key]) ? { ...(next[target.key] as Record<string, unknown>) } : {}
    if (value === undefined || sameValue(value, rawGroup[target.child])) delete group[target.child]
    else group[target.child] = value
    if (Object.keys(group).length === 0) delete next[target.key]
    else next[target.key] = group
    return next
  }

  // A list is corrected as a whole: start from the current list and change one cell.
  const rawList = Array.isArray(raw[target.key]) ? (raw[target.key] as unknown[]) : []
  const list = structuredClone(
    (Array.isArray(next[target.key]) ? next[target.key] : rawList) as unknown[],
  ).map((item) => (isRecord(item) ? item : {}))
  const rawItem = isRecord(rawList[target.index]) ? (rawList[target.index] as Record<string, unknown>) : {}
  list[target.index]![target.child] = value === undefined ? rawItem[target.child] : value
  if (sameValue(list, rawList)) delete next[target.key]
  else next[target.key] = list
  return next
}

/** The paths of every scalar Field whose shown value differs from its Raw Value (marked as edited). */
export function correctedPaths(fields: Field[], raw: InvoiceValues, corrected: InvoiceValues): string[] {
  const paths: string[] = []
  for (const field of fields) {
    if (!(field.key in corrected)) continue
    const value = corrected[field.key]
    if (!isGroupField(field)) {
      if (!sameValue(value, raw[field.key])) paths.push(field.key)
      continue
    }
    if (field.type === 'object') {
      const rawGroup = isRecord(raw[field.key]) ? (raw[field.key] as Record<string, unknown>) : {}
      const group = isRecord(value) ? value : {}
      for (const child of field.fields) {
        if (child.key in group && !sameValue(group[child.key], rawGroup[child.key])) paths.push(`${field.key}.${child.key}`)
      }
      continue
    }
    const rawList = Array.isArray(raw[field.key]) ? (raw[field.key] as unknown[]) : []
    const list = Array.isArray(value) ? value : []
    list.forEach((item, index) => {
      const rawItem = isRecord(rawList[index]) ? (rawList[index] as Record<string, unknown>) : {}
      const cur = isRecord(item) ? item : {}
      for (const child of field.fields) {
        if (!sameValue(cur[child.key], rawItem[child.key])) paths.push(`${field.key}[${index}].${child.key}`)
      }
    })
  }
  return paths
}
