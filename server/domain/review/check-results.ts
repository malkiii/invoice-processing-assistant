import type { CheckResult } from '../checks'

/** `unchecked`: Checks have not run; `clean`: none failed; `failing`: at least one failed. */
export type InvoiceCheckStatus = 'unchecked' | 'clean' | 'failing'

export function checkStatusOf(results: CheckResult[] | null): InvoiceCheckStatus {
  if (!results) return 'unchecked'
  return results.some((r) => r.status === 'fail') ? 'failing' : 'clean'
}
