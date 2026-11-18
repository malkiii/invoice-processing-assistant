/**
 * Browser side of Google Drive and Dropbox intake (ticket 12): loads the Google Picker and the
 * Dropbox Chooser, lets the User pick files, and starts one Batch per pick. The server downloads
 * the files through the User's Source Connection.
 */

export type SourceKind = 'google-drive' | 'dropbox'

/** One entry of `GET /api/sources`. */
export interface SourceOption {
  kind: SourceKind
  slug: string
  label: string
  enabled: boolean
  connection: {
    accountLabel: string
    status: 'ok' | 'broken'
    statusMessage: string | null
    connectedAt: string
  } | null
  picker: { apiKey: string; appId: string } | { appKey: string } | null
}

export interface PickedSourceFile {
  id: string
  name: string
}

export interface StartedSourceBatch {
  batchId: string
  documents: { id: string; name: string; status: string; failureReason: string | null }[]
}

/** The formats intake accepts, as the pickers filter them (the server still sniffs the content). */
const MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/html',
]
const EXTENSIONS = ['.pdf', '.docx', '.png', '.jpg', '.jpeg', '.webp', '.html', '.htm']

const scripts = new Map<string, Promise<void>>()

function loadScript(src: string, attributes: Record<string, string> = {}): Promise<void> {
  let loading = scripts.get(src)
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = src
      script.async = true
      for (const [name, value] of Object.entries(attributes)) script.setAttribute(name, value)
      script.onload = () => resolve()
      script.onerror = () => {
        scripts.delete(src)
        script.remove()
        reject(new Error(`Could not load ${new URL(src).host}. Check your connection or content blocker.`))
      }
      document.head.appendChild(script)
    })
    scripts.set(src, loading)
  }
  return loading
}

// Minimal typings for the two vendor scripts.
declare global {
  interface Window {
    gapi?: { load(api: string, callback: () => void): void }
    google?: { picker: any }
    Dropbox?: {
      choose(options: {
        success(files: { id: string; name: string }[]): void
        cancel?(): void
        linkType: 'preview' | 'direct'
        multiselect: boolean
        extensions?: string[]
        folderselect?: boolean
      }): void
    }
  }
}

async function loadGooglePicker() {
  await loadScript('https://apis.google.com/js/api.js')
  await new Promise<void>((resolve) => window.gapi!.load('picker', resolve))
}

/** Opens the Google Picker with a fresh token from the User's Source Connection. Resolves [] on cancel. */
export async function pickFromGoogleDrive(option: SourceOption): Promise<PickedSourceFile[]> {
  const config = option.picker as { apiKey: string; appId: string }
  const [{ accessToken }] = await Promise.all([
    $fetch<{ accessToken: string }>(`/api/sources/${option.slug}/token`, { method: 'POST' }),
    loadGooglePicker(),
  ])
  const picker = window.google!.picker
  return new Promise((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS)
      .setMimeTypes(MIME_TYPES.join(','))
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
      .setEnableDrives(true)
    new picker.PickerBuilder()
      .addView(view)
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .enableFeature(picker.Feature.SUPPORT_DRIVES)
      .setOAuthToken(accessToken)
      .setDeveloperKey(config.apiKey)
      .setAppId(config.appId)
      .setOrigin(window.location.origin)
      .setCallback((data: { action: string; docs?: { id: string; name: string }[] }) => {
        if (data.action === picker.Action.PICKED) resolve((data.docs ?? []).map((d) => ({ id: d.id, name: d.name })))
        else if (data.action === picker.Action.CANCEL) resolve([])
      })
      .build()
      .setVisible(true)
  })
}

/** Loads the Chooser ahead of time: `chooseFromDropbox` must run straight from a click, or the popup is blocked. */
export function prepareDropbox(option: SourceOption): Promise<void> {
  const { appKey } = option.picker as { appKey: string }
  return loadScript('https://www.dropbox.com/static/api/2/dropins.js', { id: 'dropboxjs', 'data-app-key': appKey })
}

/** Opens the Dropbox Chooser. Call `prepareDropbox` first. Resolves [] on cancel. */
export function chooseFromDropbox(): Promise<PickedSourceFile[]> {
  return new Promise((resolve, reject) => {
    if (!window.Dropbox) return reject(new Error('The Dropbox Chooser is still loading. Try again.'))
    window.Dropbox.choose({
      success: (files) => resolve(files.map((f) => ({ id: f.id, name: f.name }))),
      cancel: () => resolve([]),
      linkType: 'direct',
      multiselect: true,
      extensions: EXTENSIONS,
      folderselect: false,
    })
  })
}

export function startSourceBatch(source: SourceKind, files: PickedSourceFile[]) {
  return $fetch<StartedSourceBatch>('/api/source-batches', { method: 'POST', body: { source, files } })
}
