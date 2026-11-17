/**
 * Renders the fixture files from `cases.ts`. The outputs are committed; re-run only after changing
 * the cases: `pnpm tsx tests/fixtures/invoices/generate.ts`.
 * Needs poppler's `pdftoppm` (images, scanned PDF) and `ffmpeg` (WebP) on the PATH.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { CASES, type ExpectedInvoice, type FixtureCase } from './cases'

const here = import.meta.dirname

const money = (n: number, currency: string) => `${n.toFixed(2)} ${currency}`

/** The printed text of one invoice, line by line. */
export function invoiceLines(inv: ExpectedInvoice): string[] {
  const lines = [
    inv.vendor.name,
    inv.vendor.address ?? '',
    inv.vendor.tax_id ? `Tax ID: ${inv.vendor.tax_id}` : '',
    '',
    `INVOICE ${inv.invoice_number}`,
    `Invoice date: ${inv.issue_date}`,
    inv.due_date ? `Due date: ${inv.due_date}` : '',
    '',
    'Bill to:',
    inv.buyer.name,
    inv.buyer.address ?? '',
    inv.buyer.tax_id ? `Tax ID: ${inv.buyer.tax_id}` : '',
    '',
    'Description | Qty | Unit price | Tax | Amount',
    ...inv.line_items.map(
      (l) =>
        `${l.description} | ${l.quantity ?? ''} | ${l.unit_price?.toFixed(2) ?? ''} | ${l.tax_rate === null ? '-' : `${l.tax_rate}%`} | ${l.amount.toFixed(2)}`,
    ),
    '',
    `Subtotal: ${money(inv.subtotal, inv.currency)}`,
    `Tax: ${money(inv.tax_total, inv.currency)}`,
    `Total due: ${money(inv.total, inv.currency)}`,
    '',
    inv.payment_terms ? `Payment terms: ${inv.payment_terms}` : '',
  ]
  return lines.filter((l, i) => l !== '' || lines[i - 1] !== '')
}

async function textPdf(invoices: ExpectedInvoice[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  for (const inv of invoices) {
    const page = pdf.addPage([595, 842])
    invoiceLines(inv).forEach((text, i) => {
      const isTitle = text.startsWith('INVOICE ')
      page.drawText(text, { x: 48, y: 790 - i * 17, size: isTitle ? 15 : 10, font: isTitle ? bold : font })
    })
  }
  return pdf.save()
}

function rasterize(pdf: Uint8Array, format: 'png' | 'jpeg'): Uint8Array {
  const dir = mkdtempSync(join(tmpdir(), 'fixture-'))
  try {
    writeFileSync(join(dir, 'in.pdf'), pdf)
    execFileSync('pdftoppm', ['-r', '110', `-${format}`, '-singlefile', join(dir, 'in.pdf'), join(dir, 'out')])
    return new Uint8Array(readFileSync(join(dir, format === 'png' ? 'out.png' : 'out.jpg')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function toWebp(png: Uint8Array): Uint8Array {
  const dir = mkdtempSync(join(tmpdir(), 'fixture-'))
  try {
    writeFileSync(join(dir, 'in.png'), png)
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', join(dir, 'in.png'), '-quality', '80', join(dir, 'out.webp')])
    return new Uint8Array(readFileSync(join(dir, 'out.webp')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function scannedPdf(invoices: ExpectedInvoice[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  for (const inv of invoices) {
    const png = await pdf.embedPng(rasterize(await textPdf([inv]), 'png'))
    const page = pdf.addPage([595, 842])
    page.drawImage(png, { x: 0, y: 0, width: 595, height: 842 })
  }
  return pdf.save()
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function docx(invoices: ExpectedInvoice[]): Promise<Uint8Array> {
  const paragraph = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`
  const cell = (text: string) => `<w:tc><w:p><w:r><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p></w:tc>`
  const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
  const body = invoices
    .map((inv) => {
      const head = invoiceLines(inv)
      const tableStart = head.findIndex((l) => l.startsWith('Description |'))
      const tableEnd = tableStart + 1 + inv.line_items.length
      const rows = head.slice(tableStart, tableEnd).map((l) => `<w:tr>${l.split(' | ').map(cell).join('')}</w:tr>`)
      return [
        ...head.slice(0, tableStart).map(paragraph),
        `<w:tbl>${rows.join('')}</w:tbl>`,
        ...head.slice(tableEnd).map(paragraph),
      ].join('')
    })
    .join(pageBreak)
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  )
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  )
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

const html = (s: string) => xml(s).replace(/"/g, '&quot;')

function htmlTable(inv: ExpectedInvoice): string {
  const rows = inv.line_items
    .map(
      (l) =>
        `<tr><td>${html(l.description)}</td><td>${l.quantity}</td><td>${l.unit_price?.toFixed(2)}</td><td>${l.tax_rate}%</td><td>${l.amount.toFixed(2)}</td></tr>`,
    )
    .join('\n')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Invoice ${html(inv.invoice_number)} - ${html(inv.vendor.name)}</title>
<style>body{font-family:sans-serif} table{border-collapse:collapse} td,th{border:1px solid #ccc;padding:4px}</style>
<script>window.analytics = { track() {} }</script></head>
<body>
<header><nav><a href="/">Dashboard</a> | <a href="/billing">Billing</a> | <a href="/support">Support</a></nav></header>
<main>
<section class="from"><h2>${html(inv.vendor.name)}</h2><p>${html(inv.vendor.address ?? '')}</p><p>VAT reg. no. ${html(inv.vendor.tax_id ?? '')}</p></section>
<h1>Invoice ${html(inv.invoice_number)}</h1>
<p>Invoice date: ${inv.issue_date}<br>Due date: ${inv.due_date ?? ''}</p>
<section class="to"><h3>Billed to</h3><p>${html(inv.buyer.name)}<br>${html(inv.buyer.address ?? '')}<br>VAT: ${html(inv.buyer.tax_id ?? '')}</p></section>
<table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>VAT</th><th>Amount</th></tr></thead>
<tbody>
${rows}
</tbody></table>
<p>Subtotal: ${money(inv.subtotal, inv.currency)}</p>
<p>VAT: ${money(inv.tax_total, inv.currency)}</p>
<p><strong>Total: ${money(inv.total, inv.currency)}</strong></p>
<p>${html(inv.payment_terms ?? '')}</p>
</main>
<footer>&copy; 2026 ${html(inv.vendor.name)}. All rights reserved.</footer>
</body></html>
`
}

function htmlEmail(inv: ExpectedInvoice): string {
  const items = inv.line_items
    .map((l) => `<tr><td>${html(l.description)}</td><td align="right">${l.amount.toFixed(2)} ${inv.currency}</td></tr>`)
    .join('\n')
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Your receipt from ${html(inv.vendor.name)}</title></head>
<body style="background:#f4f4f4">
<table width="600" align="center" style="background:#fff"><tr><td>
<p>Hi ${html(inv.buyer.name.split(' ')[0]!)},</p>
<p>Thanks for your purchase! This email is your receipt.</p>
<p><b>Receipt / Invoice #${html(inv.invoice_number)}</b><br>Date: ${inv.issue_date}<br>Billed to: ${html(inv.buyer.name)}</p>
<table width="100%">
${items}
<tr><td>Subtotal</td><td align="right">${money(inv.subtotal, inv.currency)}</td></tr>
<tr><td>HST (13%)</td><td align="right">${money(inv.tax_total, inv.currency)}</td></tr>
<tr><td><b>Total charged</b></td><td align="right"><b>${money(inv.total, inv.currency)}</b></td></tr>
</table>
<p>${html(inv.payment_terms ?? '')} (Visa ending 4242).</p>
<p>${html(inv.vendor.name)} &middot; ${html(inv.vendor.address ?? '')} &middot; GST/HST no. ${html(inv.vendor.tax_id ?? '')}</p>
<p style="font-size:11px"><a href="https://example.com/unsubscribe">Unsubscribe</a></p>
</td></tr></table>
</body></html>
`
}

async function render(c: FixtureCase): Promise<Uint8Array> {
  switch (c.style) {
    case 'text-pdf':
      return textPdf(c.invoices)
    case 'scanned-pdf':
      return scannedPdf(c.invoices)
    case 'image': {
      const pdf = await textPdf(c.invoices)
      if (c.format === 'jpeg') return rasterize(pdf, 'jpeg')
      const png = rasterize(pdf, 'png')
      return c.format === 'webp' ? toWebp(png) : png
    }
    case 'docx':
      return docx(c.invoices)
    case 'html-table':
      return new TextEncoder().encode(htmlTable(c.invoices[0]!))
    case 'html-email':
      return new TextEncoder().encode(htmlEmail(c.invoices[0]!))
  }
}

for (const c of CASES) {
  writeFileSync(join(here, c.file), await render(c))
  console.log(`wrote ${c.file}`)
}
