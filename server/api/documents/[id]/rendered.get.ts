import { DOCX_VIEW_HEADERS, renderDocxForViewing } from '../../../domain/review/docx-view'

/** A Word Document rendered to HTML for the viewer (shown in a sandboxed iframe). */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const doc = await useDocumentLibrary().getDocument(user.id, getRouterParam(event, 'id')!)
  if (!doc?.storageKey || doc.format !== 'docx') throw createError({ statusCode: 404, statusMessage: 'Nothing to render' })
  const bytes = await useDocumentStorage().read(doc.storageKey)
  setResponseHeaders(event, { ...DOCX_VIEW_HEADERS, 'cache-control': 'private, max-age=300' })
  return renderDocxForViewing(bytes)
})
