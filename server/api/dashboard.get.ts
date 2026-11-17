/** Dashboard: the Needs review queue, recent Batches, usage and cost totals. */
export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  const [summary, batches] = await Promise.all([
    useReview().dashboard(user.id),
    useDocumentLibrary().listBatches(user.id),
  ])
  return { ...summary, recentBatches: batches.slice(0, 5) }
})
