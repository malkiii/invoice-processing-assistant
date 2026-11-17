import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const query = z.object({
  search: z.string().max(200).optional(),
  reviewed: z.enum(['true', 'false']).optional(),
  checks: z.enum(['unchecked', 'clean', 'failing']).optional(),
  vendor: z.string().max(200).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  order: z.enum(['recent', 'needs-review']).optional(),
})

/** The Invoice table: Invoices of Current Extractions, filtered. */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const q = await getValidatedQuery(event, query.parse)
  return useReview().listInvoices(user.id, {
    search: q.search || undefined,
    reviewed: q.reviewed === undefined ? undefined : q.reviewed === 'true',
    checks: q.checks,
    vendor: q.vendor || undefined,
    dateFrom: q.from,
    dateTo: q.to,
    order: q.order,
  })
})
