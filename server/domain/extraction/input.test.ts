import { describe, expect, it, vi } from 'vitest'
import { fixture, makePdf, makeTextPdf, PNG, text } from '../../../tests/fixtures/documents/make'
import { InputPreparationError, prepareInput, type PdfRasterizer } from './input'

const noRasterizer: PdfRasterizer = async () => {
  throw new Error('should not rasterise')
}

const invoiceHtml = `<!doctype html><html><head><title>Invoice</title><script>alert(1)</script></head><body>
  <nav>Home | Account</nav>
  <main><h1>Invoice INV-2042</h1><p>Issued by Northwind Ltd on 2026-03-01.</p>
  <table><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead>
  <tbody><tr><td>Hosting</td><td>1</td><td>49.00</td></tr></tbody></table>
  <p>Total due: 49.00 GBP</p></main></body></html>`

function textOf(parts: Awaited<ReturnType<typeof prepareInput>>): string {
  return parts.map((p) => (p.type === 'text' ? p.text : '')).join('\n')
}

describe('prepareInput', () => {
  it('sends a PDF natively to a PDF-capable model', async () => {
    const bytes = await makeTextPdf([['Invoice INV-1']])
    const parts = await prepareInput({ bytes, format: 'pdf' }, 'pdf', { rasterizePdf: noRasterizer })
    expect(parts).toEqual([{ type: 'file', data: { type: 'data', data: bytes }, mediaType: 'application/pdf' }])
  })

  it('rasterises a PDF into one image per page for a vision model', async () => {
    const bytes = await makePdf(2)
    const rasterizePdf = vi.fn<PdfRasterizer>(async () => [PNG, PNG])
    const parts = await prepareInput({ bytes, format: 'pdf' }, 'images', { rasterizePdf })
    expect(rasterizePdf).toHaveBeenCalledWith(bytes)
    expect(parts.filter((p) => p.type === 'file')).toEqual([
      { type: 'file', data: { type: 'data', data: PNG }, mediaType: 'image/png' },
      { type: 'file', data: { type: 'data', data: PNG }, mediaType: 'image/png' },
    ])
  })

  it('extracts the text layer of a PDF for a text-only model, page by page', async () => {
    const bytes = await makeTextPdf([['Invoice INV-1', 'Total 10.00'], ['Invoice INV-2', 'Total 20.00']])
    const parts = await prepareInput({ bytes, format: 'pdf' }, 'text', { rasterizePdf: noRasterizer })
    const body = textOf(parts)
    expect(body).toMatch(/Page 1[\s\S]*INV-1[\s\S]*Total 10\.00[\s\S]*Page 2[\s\S]*INV-2/)
    expect(parts.every((p) => p.type === 'text')).toBe(true)
  })

  it('fails clearly when a text-only model gets a PDF without a text layer', async () => {
    const bytes = await makePdf(1)
    await expect(prepareInput({ bytes, format: 'pdf' }, 'text', { rasterizePdf: noRasterizer })).rejects.toThrow(
      InputPreparationError,
    )
    await expect(prepareInput({ bytes, format: 'pdf' }, 'text', { rasterizePdf: noRasterizer })).rejects.toThrow(
      /no text.*vision/i,
    )
  })

  it('sends images natively to PDF- and image-capable models', async () => {
    for (const capability of ['pdf', 'images'] as const) {
      const parts = await prepareInput({ bytes: PNG, format: 'png' }, capability, { rasterizePdf: noRasterizer })
      expect(parts).toEqual([{ type: 'file', data: { type: 'data', data: PNG }, mediaType: 'image/png' }])
    }
  })

  it('refuses an image for a text-only model', async () => {
    await expect(prepareInput({ bytes: PNG, format: 'png' }, 'text', { rasterizePdf: noRasterizer })).rejects.toThrow(
      /image/i,
    )
  })

  it('converts DOCX to markdown for every model', async () => {
    for (const capability of ['pdf', 'images', 'text'] as const) {
      const parts = await prepareInput({ bytes: fixture('invoice.docx'), format: 'docx' }, capability, {
        rasterizePdf: noRasterizer,
      })
      expect(parts.every((p) => p.type === 'text')).toBe(true)
      expect(textOf(parts)).toContain('Invoice INV-001 Total 100.00 EUR')
    }
  })

  it('fails clearly on a DOCX that cannot be read', async () => {
    const broken = fixture('archive.zip')
    await expect(prepareInput({ bytes: broken, format: 'docx' }, 'pdf', { rasterizePdf: noRasterizer })).rejects.toThrow(
      /Word file could not be read/,
    )
  })

  it('converts HTML to readable markdown, keeping tables and dropping scripts', async () => {
    const parts = await prepareInput({ bytes: text(invoiceHtml), format: 'html' }, 'pdf', { rasterizePdf: noRasterizer })
    const body = textOf(parts)
    expect(body).toContain('Invoice INV-2042')
    expect(body).toMatch(/\|\s*Hosting\s*\|\s*1\s*\|\s*49\.00\s*\|/)
    expect(body).toContain('Total due: 49.00 GBP')
    expect(body).not.toContain('alert(1)')
  })

  it('keeps vendor details that sit in headings and page chrome', async () => {
    const html = `<!doctype html><html><head><title>Invoice 7 - CloudNest Hosting Ltd</title></head><body>
      <header><h2>CloudNest Hosting Ltd</h2></header><main><h1>Invoice 7</h1><p>Total: 10.00 GBP</p></main>
      <footer>CloudNest Hosting Ltd, VAT GB987654321</footer></body></html>`
    const body = textOf(await prepareInput({ bytes: text(html), format: 'html' }, 'pdf', { rasterizePdf: noRasterizer }))
    expect(body).toContain('## CloudNest Hosting Ltd')
    expect(body).toContain('VAT GB987654321')
    expect(body).toContain('Invoice 7 - CloudNest Hosting Ltd')
  })
})
