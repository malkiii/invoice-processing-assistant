import type { InternalApi } from 'nitropack/types'

export type ExportItem = InternalApi['/api/exports']['get'][number]

const POLL_MS = 2000
let pollTimer: ReturnType<typeof setTimeout> | undefined

/**
 * The downloads history drawer (spec "Export"), shared by the `/app` layout and every Export
 * button. While an Export is pending, the list is polled until the worker has finished it.
 */
export function useDownloads() {
  const open = useState('downloads-open', () => false)
  const items = useState<ExportItem[] | null>('downloads-items', () => null)
  const loading = useState('downloads-loading', () => false)

  async function refresh() {
    loading.value = true
    try {
      items.value = await $fetch<ExportItem[]>('/api/exports')
    } finally {
      loading.value = false
    }
    schedulePoll()
  }

  function schedulePoll() {
    if (!import.meta.client || pollTimer || !items.value?.some((e) => e.status === 'pending')) return
    pollTimer = setTimeout(() => {
      pollTimer = undefined
      refresh().catch(() => {})
    }, POLL_MS)
  }

  function downloadUrl(id: string) {
    return `/api/exports/${id}/download`
  }

  /** Starts the browser download of a ready Export. */
  function download(id: string) {
    window.location.assign(downloadUrl(id))
  }

  async function remove(id: string) {
    await $fetch(`/api/exports/${id}`, { method: 'DELETE' })
    items.value = items.value?.filter((e) => e.id !== id) ?? null
  }

  /** Opens the drawer, which loads the history. */
  function show() {
    open.value = true
  }

  return { open, items, loading, refresh, download, downloadUrl, remove, show }
}
