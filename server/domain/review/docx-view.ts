/**
 * The Document viewer for Word files (ADR 0004): browsers cannot show DOCX, so it is rendered to
 * HTML with mammoth. Served with a CSP sandbox and shown in a sandboxed iframe.
 */
import mammoth from 'mammoth'

const STYLE = `body{font:14px/1.5 system-ui,sans-serif;color:#111;background:#fff;margin:2rem;max-width:60rem}
table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:.25rem .5rem}img{max-width:100%}`

function page(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}</style></head><body>${body}</body></html>`
}

export async function renderDocxForViewing(bytes: Uint8Array): Promise<string> {
  try {
    const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) })
    return page(value)
  } catch {
    return page('<p>This Word file could not be shown; it may be damaged.</p>')
  }
}

/** Response headers for the rendered page: no scripts, no network, only inline styles and embedded images. */
export const DOCX_VIEW_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
  'x-content-type-options': 'nosniff',
}
