import { z } from 'zod'
import { ExportError, MAX_SELECTION } from '../../domain/export/exports'
import { CSV_LAYOUTS, EXPORT_FORMATS } from '../../domain/export/render'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const id = z.string().min(1).max(100)

const body = z.object({
  format: z.enum(EXPORT_FORMATS),
  csvLayout: z.enum(CSV_LAYOUTS).optional(),
  reviewedOnly: z.boolean().optional(),
  scope: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('invoice'), invoiceId: id }),
    z.object({ kind: z.literal('selection'), invoiceIds: z.array(id).min(1).max(MAX_SELECTION) }),
    z.object({ kind: z.literal('batch'), batchId: id }),
    z.object({
      kind: z.literal('filter'),
      filter: z.object({
        search: z.string().max(200).optional(),
        reviewed: z.boolean().optional(),
        checks: z.enum(['unchecked', 'clean', 'failing']).optional(),
        vendor: z.string().max(200).optional(),
        dateFrom: isoDate.optional(),
        dateTo: isoDate.optional(),
      }),
    }),
  ]),
})

/** Requests an Export. Small ones come back `ready`; large ones `pending` until the worker is done. */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const request = await readValidatedBody(event, body.parse)
  try {
    const created = await (await useExports()).request(user.id, request)
    setResponseStatus(event, created.status === 'pending' ? 202 : 201)
    return created
  } catch (error) {
    if (error instanceof ExportError) throw createError({ statusCode: 422, statusMessage: error.message })
    throw error
  }
})
