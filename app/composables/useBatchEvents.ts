/**
 * Live Document status changes for a changing set of Batches: one event stream per Batch,
 * opened and closed as the set changes. `onOpen` fires on every (re)connect so callers can reload
 * whatever was missed while disconnected.
 */
export interface DocumentStatusChange {
  documentId: string
  batchId: string
  status: string
  failureReason: string | null
}

export function useBatchEvents(
  batchIds: MaybeRefOrGetter<readonly (string | null | undefined)[]>,
  handlers: { onChange: (change: DocumentStatusChange) => void; onOpen?: (batchId: string) => void },
) {
  const sources = new Map<string, EventSource>()

  function sync() {
    const wanted = new Set(toValue(batchIds).filter((id): id is string => !!id))
    for (const [id, source] of sources) {
      if (!wanted.has(id)) {
        source.close()
        sources.delete(id)
      }
    }
    for (const id of wanted) {
      if (sources.has(id)) continue
      const source = new EventSource(`/api/batches/${id}/events`)
      source.onopen = () => handlers.onOpen?.(id)
      source.addEventListener('status', (e) => {
        handlers.onChange({ batchId: id, ...JSON.parse((e as MessageEvent).data) })
      })
      sources.set(id, source)
    }
  }

  onMounted(() => {
    watch(() => [...toValue(batchIds)], sync, { immediate: true })
  })
  onBeforeUnmount(() => {
    for (const source of sources.values()) source.close()
    sources.clear()
  })
}

/** Document statuses that can still change on their own. */
export const IN_FLIGHT_STATUSES: readonly string[] = ['uploading', 'fetching', 'queued', 'processing']
