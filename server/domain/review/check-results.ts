/**
 * The shape of `invoice.check_results` as written by Checks (issue 07) and read by Review.
 * `fields` holds Field paths in the same form as Corrected Values (`total`, `vendor.name`,
 * `line_items.0.amount`), so failures can be shown next to their Fields.
 */
export type CheckStatus = 'pass' | 'fail' | 'not_applicable'

export interface CheckResult {
  id: string
  status: CheckStatus
  message: string
  fields: string[]
}

/** `unchecked`: Checks have not run; `clean`: none failed; `failing`: at least one failed. */
export type InvoiceCheckStatus = 'unchecked' | 'clean' | 'failing'

const STATUSES: readonly string[] = ['pass', 'fail', 'not_applicable']

function isCheckResult(value: unknown): value is CheckResult {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.status === 'string' &&
    STATUSES.includes(v.status) &&
    typeof v.message === 'string' &&
    Array.isArray(v.fields) &&
    v.fields.every((f) => typeof f === 'string')
  )
}

/** Reads the stored column defensively: null until Checks have run; malformed entries are dropped. */
export function readCheckResults(stored: unknown): CheckResult[] | null {
  if (!Array.isArray(stored)) return null
  return stored.filter(isCheckResult)
}

export function checkStatusOf(results: CheckResult[] | null): InvoiceCheckStatus {
  if (!results) return 'unchecked'
  return results.some((r) => r.status === 'fail') ? 'failing' : 'clean'
}
