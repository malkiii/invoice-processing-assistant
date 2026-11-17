/**
 * Server-sent events: one `status` event per Document status change in this Batch.
 * Clients reload the Batch on (re)connect, so missed events while disconnected are harmless.
 */
export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  const batchId = getRouterParam(event, 'id')!
  const found = await useDocumentLibrary().getBatch(session.user.id, batchId)
  if (!found) throw createError({ statusCode: 404, statusMessage: 'Batch not found' })

  const listener = await useDocumentEvents()
  const stream = createEventStream(event)
  const unsubscribe = listener.subscribe((change) => {
    if (change.batchId !== batchId || change.userId !== session.user.id) return
    void stream.push({ event: 'status', data: JSON.stringify(change) })
  })
  // A periodic event keeps proxies from closing an idle stream.
  const keepAlive = setInterval(() => void stream.push({ event: 'ping', data: '' }), 25_000)
  stream.onClosed(async () => {
    clearInterval(keepAlive)
    unsubscribe()
    await stream.close()
  })
  return stream.send()
})
