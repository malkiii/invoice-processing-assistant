/**
 * Checks (spec "Checks"): deterministic rules over an Invoice's merged values (Raw overlaid with
 * Corrected). No LLM, no I/O. A failed Check flags the Invoice; it never changes values.
 *
 * Checks find the Fields they need by the default Template's keys (`line_items[].amount`,
 * `subtotal`, `tax_total`, `total`, `issue_date`, `due_date`, `currency`, `vendor.name`,
 * `invoice_number`). A custom Template without those Fields gets `not_applicable`.
 */
import type { Field, InvoiceValues } from '../template/fields'

export type CheckId = 'line_items_sum' | 'totals_sum' | 'dates' | 'currency' | 'required_fields' | 'duplicate'

export type CheckStatus = 'pass' | 'fail' | 'not_applicable'

/**
 * One Check's outcome, as stored in `invoice.check_results`.
 * `fields` are Field paths: a top-level key (`total`), a key inside a group (`vendor.name`), or a
 * key inside one list item (`line_items[2].amount`).
 */
export interface CheckResult {
  id: CheckId
  status: CheckStatus
  message: string
  fields: string[]
  /** `duplicate` only: the other Invoices with the same vendor and invoice number. */
  relatedInvoiceIds?: string[]
}

export interface ChecksInput {
  /** The Fields of the Extraction's Template Snapshot. */
  fields: Field[]
  /** Raw Values overlaid with Corrected Values. */
  values: InvoiceValues
  /** Ids of the User's other Invoices with the same vendor and invoice number (see `duplicateKey`). */
  duplicates: string[]
}

/** Rounding tolerance per summed amount, in the invoice currency. */
export const ROUNDING_TOLERANCE = 0.01
/** Absorbs binary floating-point error at the tolerance boundary. */
const EPSILON = 1e-9

export function runChecks(input: ChecksInput): CheckResult[] {
  return [lineItemsSum(input), totalsSum(input), dates(input), currency(input), requiredFields(input), duplicate(input)]
}

/**
 * Identifies an Invoice for the duplicate Check: its vendor name and invoice number, normalised
 * for case and spacing. Null when the Template lacks those Fields or either value is missing.
 */
export function duplicateKey(fields: Field[], values: InvoiceValues): string | null {
  const vendor = vendorName(fields, values)
  const number = topField(fields, 'invoice_number')?.type === 'text' ? values.invoice_number : null
  if (typeof vendor !== 'string' || typeof number !== 'string' || isBlank(vendor) || isBlank(number)) return null
  return JSON.stringify([normalise(vendor), normalise(number)])
}

function normalise(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** The vendor name Field: `vendor.name` (default Template) or a plain text `vendor`. */
function vendorPath(fields: Field[]): string | null {
  const vendor = topField(fields, 'vendor')
  if (vendor?.type === 'text') return 'vendor'
  if (vendor?.type === 'object' && topField(vendor.fields, 'name')?.type === 'text') return 'vendor.name'
  return null
}

function vendorName(fields: Field[], values: InvoiceValues): unknown {
  const path = vendorPath(fields)
  if (path === 'vendor') return values.vendor
  if (path === 'vendor.name') return asRecord(values.vendor)?.name
  return null
}

function duplicate({ fields, values, duplicates }: ChecksInput): CheckResult {
  const paths = [vendorPath(fields) ?? 'vendor', 'invoice_number']
  if (duplicateKey(fields, values) === null) {
    return result('duplicate', 'not_applicable', 'There is no vendor and invoice number to compare.', paths)
  }
  if (duplicates.length === 0) {
    return result('duplicate', 'pass', 'No other Invoice has this vendor and invoice number.', paths)
  }
  const others = duplicates.length === 1 ? 'Another Invoice has' : `${duplicates.length} other Invoices have`
  return {
    ...result('duplicate', 'fail', `Possible duplicate: ${others} the same vendor and invoice number.`, paths),
    relatedInvoiceIds: [...duplicates],
  }
}

interface Missing {
  path: string
  label: string
}

function missingRequired(fields: Field[], values: Record<string, unknown>, prefix = '', labelPrefix = ''): Missing[] {
  return fields.flatMap((field): Missing[] => {
    const path = prefix + field.key
    const label = labelPrefix + field.label
    const value = values[field.key]
    if (field.type === 'object') {
      const group = asRecord(value)
      if (!group) return field.required ? [{ path, label }] : []
      return missingRequired(field.fields, group, `${path}.`, `${label} `)
    }
    if (field.type === 'list') {
      const items = Array.isArray(value) ? value : []
      if (items.length === 0) return field.required ? [{ path, label }] : []
      return items.flatMap((item, i) =>
        missingRequired(field.fields, asRecord(item) ?? {}, `${path}[${i}].`, `${label} ${i + 1}: `),
      )
    }
    if (!field.required) return []
    const absent = field.type === 'money' ? readAmount(value) === null : isBlank(value)
    return absent ? [{ path, label }] : []
  })
}

function hasRequired(fields: Field[]): boolean {
  return fields.some((f) => f.required || ((f.type === 'object' || f.type === 'list') && hasRequired(f.fields)))
}

function requiredFields({ fields, values }: ChecksInput): CheckResult {
  if (!hasRequired(fields)) {
    return result('required_fields', 'not_applicable', 'The Template has no required Fields.', [])
  }
  const missing = missingRequired(fields, values)
  if (missing.length === 0) return result('required_fields', 'pass', 'All required Fields are present.', [])
  return result(
    'required_fields',
    'fail',
    `Missing required Fields: ${missing.map((m) => m.label).join(', ')}.`,
    missing.map((m) => m.path),
  )
}

interface Leaf {
  path: string
  field: Field
  value: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/** Every scalar Field with its value and path, descending into groups and each list item. */
function leaves(fields: Field[], values: InvoiceValues, prefix = ''): Leaf[] {
  return fields.flatMap((field): Leaf[] => {
    const path = prefix + field.key
    const value = values[field.key]
    if (field.type === 'object') {
      const group = asRecord(value)
      return group ? leaves(field.fields, group, `${path}.`) : []
    }
    if (field.type === 'list') {
      const items = Array.isArray(value) ? value : []
      return items.flatMap((item, i) => {
        const record = asRecord(item)
        return record ? leaves(field.fields, record, `${path}[${i}].`) : []
      })
    }
    return [{ path, field, value }]
  })
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** A calendar date as YYYY-MM-DD, as Templates ask the model for; null if invalid. */
function parseDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = ISO_DATE.exec(value.trim())
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
    ? value.trim()
    : null
}

function dates({ fields, values }: ChecksInput): CheckResult {
  const present = leaves(fields, values).filter((l) => l.field.type === 'date' && !isBlank(l.value))
  if (present.length === 0) return result('dates', 'not_applicable', 'There are no dates.', [])
  const invalid = present.filter((l) => parseDate(l.value) === null).map((l) => l.path)
  if (invalid.length > 0) {
    return result('dates', 'fail', `Not a valid date (YYYY-MM-DD): ${invalid.join(', ')}.`, invalid)
  }
  const issue = present.find((l) => l.path === 'issue_date')
  const due = present.find((l) => l.path === 'due_date')
  const paths = present.map((l) => l.path)
  if (issue && due && parseDate(due.value)! < parseDate(issue.value)!) {
    return result('dates', 'fail', 'The due date is before the issue date.', ['issue_date', 'due_date'])
  }
  return result('dates', 'pass', 'The dates are valid.', paths)
}

let iso4217: Set<string> | undefined
function isCurrencyCode(code: string): boolean {
  iso4217 ??= new Set(Intl.supportedValuesOf('currency'))
  return iso4217.has(code.trim().toUpperCase())
}

function currency({ fields, values }: ChecksInput): CheckResult {
  const codes = leaves(fields, values).flatMap((l): { path: string; code: unknown }[] => {
    if (l.field.key === 'currency' && (l.field.type === 'text' || l.field.type === 'enum')) {
      return isBlank(l.value) ? [] : [{ path: l.path, code: l.value }]
    }
    if (l.field.type === 'money') {
      const code = asRecord(l.value)?.currency
      return isBlank(code) ? [] : [{ path: l.path, code }]
    }
    return []
  })
  if (codes.length === 0) return result('currency', 'not_applicable', 'There is no currency.', [])
  const invalid = codes.filter((c) => typeof c.code !== 'string' || !isCurrencyCode(c.code))
  if (invalid.length > 0) {
    const shown = [...new Set(invalid.map((c) => String(c.code)))].join(', ')
    return result('currency', 'fail', `Not an ISO 4217 currency code: ${shown}.`, invalid.map((c) => c.path))
  }
  return result('currency', 'pass', 'The currency is a valid ISO 4217 code.', codes.map((c) => c.path))
}

const result = (id: CheckId, status: CheckStatus, message: string, fields: string[]): CheckResult => ({
  id,
  status,
  message,
  fields,
})

function topField(fields: Field[], key: string): Field | undefined {
  return fields.find((f) => f.key === key)
}

function isAmountField(field: Field | undefined): boolean {
  return field?.type === 'number' || field?.type === 'money'
}

interface Amount {
  value: number
  currency: string | null
}

/** Reads a number or a `MoneyValue`; null when absent or not a finite number. */
function readAmount(value: unknown): Amount | null {
  if (typeof value === 'number') return Number.isFinite(value) ? { value, currency: null } : null
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? { value: n, currency: null } : null
  }
  if (value && typeof value === 'object' && 'amount' in value) {
    const inner = readAmount((value as { amount: unknown }).amount)
    const currency = (value as { currency?: unknown }).currency
    return inner && { value: inner.value, currency: typeof currency === 'string' && currency ? currency : null }
  }
  return null
}

function money(n: number): string {
  return n.toFixed(2)
}

function lineItemsSum({ fields, values }: ChecksInput): CheckResult {
  const paths = ['line_items', 'subtotal']
  const list = topField(fields, 'line_items')
  const amountField = list && 'fields' in list && list.type === 'list' ? topField(list.fields, 'amount') : undefined
  if (!amountField || !isAmountField(amountField) || !isAmountField(topField(fields, 'subtotal'))) {
    return result('line_items_sum', 'not_applicable', 'The Template has no line item amounts and subtotal.', paths)
  }
  const subtotal = readAmount(values.subtotal)
  const items = Array.isArray(values.line_items) ? values.line_items : []
  if (items.length === 0) return result('line_items_sum', 'not_applicable', 'There are no line items.', paths)
  if (!subtotal) return result('line_items_sum', 'not_applicable', 'There is no subtotal.', paths)
  const amounts = items.map((item) => readAmount((item as Record<string, unknown> | null)?.amount))
  const missing = amounts.flatMap((a, i) => (a ? [] : [`line_items[${i}].amount`]))
  if (missing.length > 0) {
    return result('line_items_sum', 'not_applicable', 'Some line items have no amount.', [...paths, ...missing])
  }
  const all = [...(amounts as Amount[]), subtotal]
  if (mixedCurrencies(all)) {
    return result('line_items_sum', 'fail', 'The line items and subtotal are in different currencies.', paths)
  }
  const sum = (amounts as Amount[]).reduce((s, a) => s + a.value, 0)
  if (Math.abs(sum - subtotal.value) <= ROUNDING_TOLERANCE * items.length + EPSILON) {
    return result('line_items_sum', 'pass', 'The line items add up to the subtotal.', paths)
  }
  return result(
    'line_items_sum',
    'fail',
    `The line items add up to ${money(sum)}, but the subtotal is ${money(subtotal.value)}.`,
    paths,
  )
}

function totalsSum({ fields, values }: ChecksInput): CheckResult {
  const paths = ['subtotal', 'tax_total', 'total']
  if (!paths.every((key) => isAmountField(topField(fields, key)))) {
    return result('totals_sum', 'not_applicable', 'The Template has no subtotal, tax total and total.', paths)
  }
  const [subtotal, tax, total] = paths.map((key) => readAmount(values[key]))
  if (!subtotal || !tax || !total) {
    return result('totals_sum', 'not_applicable', 'The subtotal, tax total or total is missing.', paths)
  }
  if (mixedCurrencies([subtotal, tax, total])) {
    return result('totals_sum', 'fail', 'The subtotal, tax total and total are in different currencies.', paths)
  }
  const sum = subtotal.value + tax.value
  if (Math.abs(sum - total.value) <= ROUNDING_TOLERANCE * 2 + EPSILON) {
    return result('totals_sum', 'pass', 'The subtotal plus tax equals the total.', paths)
  }
  return result(
    'totals_sum',
    'fail',
    `The subtotal plus tax is ${money(sum)}, but the total is ${money(total.value)}.`,
    paths,
  )
}

function mixedCurrencies(amounts: Amount[]): boolean {
  return new Set(amounts.flatMap((a) => (a.currency ? [a.currency.trim().toUpperCase()] : []))).size > 1
}
