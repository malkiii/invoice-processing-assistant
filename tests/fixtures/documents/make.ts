import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'

/** Builds a real PDF with `pages` blank pages. */
export async function makePdf(pages: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  for (let i = 0; i < pages; i++) pdf.addPage([595, 842])
  return pdf.save()
}

export function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(import.meta.dirname, name)))
}

// Minimal byte prefixes that content sniffing recognises.
export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])
export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0])
export const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 26, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c, 13, 0, 0, 0, 0x2f, 0, 0, 0, 0x10, 0x07, 0x10, 0x11, 0x11, 0x88, 0x88, 0xfe, 0x07, 0])

export const text = (s: string) => new TextEncoder().encode(s)

/** Builds a real PDF with a text layer: one page per entry, each line drawn top to bottom. */
export async function makeTextPdf(pages: string[][]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (const lines of pages) {
    const page = pdf.addPage([595, 842])
    lines.forEach((line, i) => page.drawText(line, { x: 50, y: 790 - i * 18, size: 11, font }))
  }
  return pdf.save()
}
