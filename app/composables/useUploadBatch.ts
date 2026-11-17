/**
 * Browser side of upload intake: collects files (including dropped folders), starts a Batch,
 * PUTs each file to its presigned URL with progress, then asks the server to confirm it.
 */

interface PresignedUpload {
  url: string
  method: 'PUT'
  headers: Record<string, string>
}

interface StartedDocument {
  id: string
  name: string
  status: string
  failureReason: string | null
  upload?: PresignedUpload
}

export interface UploadItem {
  id: string
  name: string
  size: number
  /** 0–1 while uploading. */
  progress: number
  phase: 'waiting' | 'uploading' | 'checking' | 'done'
  status: string
  failureReason: string | null
}

export interface PickedFile {
  file: File
  /** Path inside a picked or dropped folder, else the file name. */
  name: string
}

const CONCURRENCY = 4

/** Files from an `<input type="file">`, keeping folder-relative paths (`webkitdirectory`). */
export function filesFromInput(list: FileList | null): PickedFile[] {
  return Array.from(list ?? []).map((file) => ({ file, name: file.webkitRelativePath || file.name }))
}

/** Files from a drop, walking dropped folders recursively. */
export async function filesFromDrop(transfer: DataTransfer): Promise<PickedFile[]> {
  const entries = Array.from(transfer.items)
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => !!entry)
  if (entries.length === 0) return filesFromInput(transfer.files)
  const nested = await Promise.all(entries.map((entry) => walk(entry, '')))
  return nested.flat()
}

async function walk(entry: FileSystemEntry, prefix: string): Promise<PickedFile[]> {
  const path = prefix + entry.name
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
    return [{ file, name: path }]
  }
  if (!entry.isDirectory) return []
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  const children: FileSystemEntry[] = []
  // readEntries returns at most ~100 entries per call; read until empty.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
    if (batch.length === 0) break
    children.push(...batch)
  }
  const nested = await Promise.all(children.map((child) => walk(child, `${path}/`)))
  return nested.flat()
}

function put(upload: PresignedUpload, file: File, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(upload.method, upload.url)
    for (const [name, value] of Object.entries(upload.headers)) xhr.setRequestHeader(name, value)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)))
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.send(file)
  })
}

export function useUploadBatch() {
  const items = ref<UploadItem[]>([])
  const batchId = ref<string | null>(null)
  const busy = ref(false)
  const error = ref<string | null>(null)

  async function start(picked: PickedFile[]) {
    if (picked.length === 0 || busy.value) return
    busy.value = true
    error.value = null
    batchId.value = null
    items.value = []
    try {
      const started = await $fetch<{ batchId: string; documents: StartedDocument[] }>('/api/batches', {
        method: 'POST',
        body: { files: picked.map((p) => ({ name: p.name, size: p.file.size })) },
      })
      batchId.value = started.batchId
      const files = new Map(picked.map((p) => [p.name, p.file]))
      items.value = started.documents.map((d) => ({
        id: d.id,
        name: d.name,
        size: files.get(d.name)?.size ?? 0,
        progress: 0,
        phase: d.upload ? 'waiting' : 'done',
        status: d.status,
        failureReason: d.failureReason,
      }))

      // Folder paths are unique, so name → File is safe within one Batch.
      const queue = started.documents.filter((d) => d.upload)
      const runOne = async (doc: StartedDocument) => {
        const item = items.value.find((i) => i.id === doc.id)!
        item.phase = 'uploading'
        try {
          await put(doc.upload!, files.get(doc.name)!, (p) => (item.progress = p))
          item.progress = 1
        } catch {
          // The server records the failure when it finds no file.
        }
        item.phase = 'checking'
        try {
          const confirmed = await $fetch<{ status: string; failureReason: string | null }>(
            `/api/documents/${doc.id}/confirm`,
            { method: 'POST' },
          )
          item.status = confirmed.status
          item.failureReason = confirmed.failureReason
        } catch {
          item.status = 'failed'
          item.failureReason = 'Could not reach the server to confirm this upload.'
        }
        item.phase = 'done'
      }
      const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        for (let doc = queue.shift(); doc; doc = queue.shift()) await runOne(doc)
      })
      await Promise.all(workers)
    } catch (err: any) {
      error.value = err?.data?.statusMessage ?? err?.message ?? 'Upload failed.'
    } finally {
      busy.value = false
    }
  }

  return { items, batchId, busy, error, start }
}
