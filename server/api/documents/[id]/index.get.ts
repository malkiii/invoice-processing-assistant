import { listExtractions, listInvoices } from '../../../domain/extractions'

/** The Document, a short-lived URL for viewing its file, its Extraction history and current Invoices. */
export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  const id = getRouterParam(event, 'id')!
  const library = useDocumentLibrary()
  const found = await library.getDocument(session.user.id, id)
  if (!found) throw createError({ statusCode: 404, statusMessage: 'Document not found' })
  const fileUrl = found.status === 'failed' ? null : await library.fileUrl(session.user.id, id)
  const history = await listExtractions(useDb(), session.user.id, id)
  const extractions = history.map(({ templateSnapshot: _snapshot, ...summary }) => summary)
  const current = history.find((e) => e.isCurrent)
  const invoices = current ? await listInvoices(useDb(), session.user.id, current.id) : []
  return { ...found, fileUrl, extractions, invoices }
})
