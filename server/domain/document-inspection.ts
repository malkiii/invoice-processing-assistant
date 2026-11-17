import { fileTypeFromBuffer } from 'file-type'
import { PDFDocument } from 'pdf-lib'

export type DocumentFormat = 'pdf' | 'docx' | 'png' | 'jpeg' | 'webp' | 'html'

export interface DocumentLimits {
  maxDocumentBytes: number
  maxDocumentPages: number
}

export type InspectionResult =
  | {
      ok: true
      format: DocumentFormat
      mimeType: string
      /** Pages for PDFs, 1 for images, null where a format has no fixed pagination (DOCX, HTML). */
      pageCount: number | null
    }
  | { ok: false; reason: string }

export const MIME_TYPES: Record<DocumentFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  html: 'text/html',
}

const SNIFFED_FORMATS: Record<string, DocumentFormat | undefined> = Object.fromEntries(
  Object.entries(MIME_TYPES).map(([format, mime]) => [mime, format as DocumentFormat]),
)

const UNSUPPORTED = 'Unsupported file type. Accepted formats: PDF, DOCX, PNG, JPEG, WEBP, HTML.'
const KB = 1024
const MB = 1024 * KB

function formatLimit(bytes: number): string {
  if (bytes < MB) return `${Math.floor(bytes / KB)} KB`
  const mb = bytes / MB
  return Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`
}

/** Rounds up, so a file just over the limit never prints as equal to it. */
function formatSize(bytes: number): string {
  if (bytes < MB) return `${Math.ceil(bytes / KB)} KB`
  return `${(Math.ceil((bytes / MB) * 10) / 10).toFixed(1)} MB`
}

/**
 * Returns the rejection reason when a Document of `byteCount` bytes is over the size limit, else null.
 * Lets intake reject a file before reading it (a declared size, a HEAD, a streamed download).
 */
export function checkSize(byteCount: number, limits: DocumentLimits): string | null {
  if (byteCount <= limits.maxDocumentBytes) return null
  return `File is ${formatSize(byteCount)}; the limit is ${formatLimit(limits.maxDocumentBytes)}.`
}

/** file-type does not detect HTML, so look at how the text starts. */
function looksLikeHtml(bytes: Uint8Array): boolean {
  const head = new TextDecoder('utf-8').decode(bytes.subarray(0, 2048))
  const start = head.replace(/^﻿/, '').replace(/^(\s|<!--[\s\S]*?-->)+/, '')
  return /^<(!doctype\s+html|html|head|body)[\s>]/i.test(start)
}

async function countPdfPages(bytes: Uint8Array): Promise<number | null> {
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
    return pdf.getPageCount()
  } catch {
    return null
  }
}

/**
 * Checks a Document's bytes against the accepted formats and the instance limits (ADR 0007).
 * The format comes from content sniffing, never from the file name.
 */
export async function inspectDocument(bytes: Uint8Array, limits: DocumentLimits): Promise<InspectionResult> {
  if (bytes.length === 0) return { ok: false, reason: 'File is empty.' }
  const tooLarge = checkSize(bytes.length, limits)
  if (tooLarge) return { ok: false, reason: tooLarge }

  const sniffed = await fileTypeFromBuffer(bytes)
  const format = sniffed ? SNIFFED_FORMATS[sniffed.mime] : looksLikeHtml(bytes) ? 'html' : undefined
  if (!format) return { ok: false, reason: UNSUPPORTED }

  if (format !== 'pdf') {
    const pageCount = format === 'docx' || format === 'html' ? null : 1
    return { ok: true, format, mimeType: MIME_TYPES[format], pageCount }
  }

  const pageCount = await countPdfPages(bytes)
  if (pageCount === null) return { ok: false, reason: 'The PDF could not be read; it may be damaged.' }
  if (pageCount > limits.maxDocumentPages) {
    return {
      ok: false,
      reason: `Document has ${pageCount} pages; the limit is ${limits.maxDocumentPages} pages.`,
    }
  }
  return { ok: true, format, mimeType: MIME_TYPES.pdf, pageCount }
}
