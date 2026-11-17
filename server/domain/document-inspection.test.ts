import { describe, expect, it } from 'vitest'
import { inspectDocument } from './document-inspection'
import { JPEG, PNG, WEBP, fixture, makePdf, text } from '../../tests/fixtures/documents/make'

const limits = { maxDocumentBytes: 25 * 1024 * 1024, maxDocumentPages: 30 }

describe('inspectDocument', () => {
  it('accepts a PDF within the limits and counts its pages', async () => {
    const result = await inspectDocument(await makePdf(3), limits)
    expect(result).toEqual({ ok: true, format: 'pdf', mimeType: 'application/pdf', pageCount: 3 })
  })

  it('rejects a PDF over the page limit, naming both counts', async () => {
    const result = await inspectDocument(await makePdf(31), limits)
    expect(result).toEqual({ ok: false, reason: 'Document has 31 pages; the limit is 30 pages.' })
  })

  it('rejects a file over the size limit, in KB below 1 MB', async () => {
    const result = await inspectDocument(new Uint8Array(1025), { ...limits, maxDocumentBytes: 1024 })
    expect(result).toEqual({ ok: false, reason: 'File is 2 KB; the limit is 1 KB.' })
  })

  it('formats the default size limit as 25 MB', async () => {
    const bytes = new Uint8Array(25 * 1024 * 1024 + 1)
    const result = await inspectDocument(bytes, limits)
    expect(result).toEqual({ ok: false, reason: 'File is 25.1 MB; the limit is 25 MB.' })
  })

  it.each([
    ['png', PNG, 'image/png'],
    ['jpeg', JPEG, 'image/jpeg'],
    ['webp', WEBP, 'image/webp'],
  ] as const)('accepts a %s image as one page', async (format, bytes, mimeType) => {
    expect(await inspectDocument(bytes, limits)).toEqual({ ok: true, format, mimeType, pageCount: 1 })
  })

  it('accepts a DOCX without a page count (it has no fixed pagination)', async () => {
    expect(await inspectDocument(fixture('invoice.docx'), limits)).toEqual({
      ok: true,
      format: 'docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      pageCount: null,
    })
  })

  it.each([
    ['a doctype', '<!DOCTYPE html><html><body>Invoice</body></html>'],
    ['a BOM and leading whitespace', '﻿\n  <html lang="en"><body>Invoice</body></html>'],
    ['a leading comment', '<!-- saved from mail --><html><body>Invoice</body></html>'],
    ['no html element', '<head><title>Invoice</title></head>'],
  ])('accepts HTML starting with %s', async (_, source) => {
    expect(await inspectDocument(text(source), limits)).toEqual({
      ok: true,
      format: 'html',
      mimeType: 'text/html',
      pageCount: null,
    })
  })

  const unsupported =
    'Unsupported file type. Accepted formats: PDF, DOCX, PNG, JPEG, WEBP, HTML.'

  it.each([
    ['a plain zip', fixture('archive.zip')],
    ['plain text', text('Invoice 42, total 100 EUR')],
    ['XML that is not HTML', text('<?xml version="1.0"?><invoice/>')],
  ])('rejects %s as unsupported', async (_, bytes) => {
    expect(await inspectDocument(bytes, limits)).toEqual({ ok: false, reason: unsupported })
  })

  it('rejects an empty file', async () => {
    expect(await inspectDocument(new Uint8Array(), limits)).toEqual({ ok: false, reason: 'File is empty.' })
  })

  it('rejects a damaged PDF with a clear reason', async () => {
    const bytes = text('%PDF-1.7\nthis is not really a pdf')
    expect(await inspectDocument(bytes, limits)).toEqual({
      ok: false,
      reason: 'The PDF could not be read; it may be damaged.',
    })
  })

  it('accepts a PDF exactly at the page limit', async () => {
    const result = await inspectDocument(await makePdf(30), limits)
    expect(result).toMatchObject({ ok: true, pageCount: 30 })
  })
})
