import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMPLATE } from '../template/default-template'
import type { ExportInvoice } from './flatten'
import { renderExport, toCsv } from './render'

const invoice = (id: string, values: Record<string, unknown>): ExportInvoice => ({
  id,
  documentId: 'doc-1',
  documentName: 'batch/acme, "march".pdf',
  position: 0,
  templateName: 'Invoice (default)',
  fields: DEFAULT_TEMPLATE.fields,
  values,
  reviewedAt: null,
})

const acme = invoice('inv-1', {
  vendor: { name: 'Acme GmbH', address: null, tax_id: null },
  invoice_number: '=HYPERLINK("http://evil")',
  total: 1190,
  currency: 'EUR',
  line_items: [
    { description: 'Consulting\nhours', quantity: 2, unit_price: 500, amount: 1000, tax_rate: 19 },
    { description: 'Travel', quantity: null, unit_price: null, amount: 190, tax_rate: null },
  ],
})

describe('toCsv', () => {
  it('quotes commas, quotes and newlines, and defuses cells that spreadsheets would run as formulas', () => {
    const csv = toCsv({
      columns: ['a', 'b', 'c', 'd'],
      rows: [
        ['x, y', 'say "hi"', 'two\nlines', null],
        ['=1+1', -5, '-5', true],
      ],
    })
    expect(csv).toBe('﻿a,b,c,d\r\n"x, y","say ""hi""","two\nlines",\r\n\'=1+1,-5,\'-5,true\r\n')
  })
})

describe('renderExport', () => {
  it('renders CSV as one row per line item by default', async () => {
    const out = await renderExport([acme], { format: 'csv' })
    expect(out.extension).toBe('csv')
    expect(out.contentType).toBe('text/csv; charset=utf-8')
    const lines = new TextDecoder().decode(out.bytes).split('\r\n')
    expect(lines).toHaveLength(4) // header, two line items, trailing empty
    expect([...out.bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]) // UTF-8 BOM (TextDecoder drops it)
    expect(lines[0]).toMatch(/^invoice_id,document,/)
    expect(lines[1]).toContain('"Consulting\nhours"')
  })

  it('renders the CSV zip layout as invoices.csv and line_items.csv linked by invoice_id', async () => {
    const out = await renderExport([acme], { format: 'csv', csvLayout: 'zip' })
    expect(out.extension).toBe('zip')
    const zip = await JSZip.loadAsync(out.bytes)
    expect(Object.keys(zip.files).sort()).toEqual(['invoices.csv', 'line_items.csv'])
    const items = (await zip.file('line_items.csv')!.async('string')).split('\r\n')
    expect(items[0]).toBe('﻿invoice_id,item,line_items.description,line_items.quantity,line_items.unit_price,line_items.amount,line_items.tax_rate')
    expect(items[2]).toBe('inv-1,2,Travel,,,190,')
  })

  it('renders XLSX with an Invoices and a Line items sheet, numbers as numbers', async () => {
    const out = await renderExport([acme], { format: 'xlsx' })
    expect(out.extension).toBe('xlsx')
    const zip = await JSZip.loadAsync(out.bytes)
    const workbook = await zip.file('xl/workbook.xml')!.async('string')
    expect(workbook).toContain('<sheet name="Invoices" sheetId="1" r:id="rId1"/>')
    expect(workbook).toContain('<sheet name="Line items" sheetId="2" r:id="rId2"/>')
    const items = await zip.file('xl/worksheets/sheet2.xml')!.async('string')
    expect(items).toContain('<c r="A2" t="inlineStr"><is><t xml:space="preserve">inv-1</t></is></c>')
    expect(items).toContain('<c r="F2"><v>1000</v></c>')
    expect(items).toContain('<t xml:space="preserve">Consulting\nhours</t>')
    const invoices = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(invoices).toContain('acme, &quot;march&quot;.pdf')
    expect(await zip.file('[Content_Types].xml')!.async('string')).toContain('/xl/worksheets/sheet2.xml')
  })

  it('renders JSON nested, with values in Template order', async () => {
    const out = await renderExport([acme], { format: 'json' })
    expect(out.contentType).toBe('application/json')
    const json = JSON.parse(new TextDecoder().decode(out.bytes))
    expect(json.invoices).toHaveLength(1)
    expect(json.invoices[0]).toMatchObject({
      invoice_id: 'inv-1',
      document: { id: 'doc-1', name: 'batch/acme, "march".pdf' },
      invoice_in_document: 1,
      template: 'Invoice (default)',
      reviewed_at: null,
    })
    expect(json.invoices[0].values.vendor).toEqual({ name: 'Acme GmbH', address: null, tax_id: null })
    expect(json.invoices[0].values.line_items[1]).toEqual({ description: 'Travel', quantity: null, unit_price: null, amount: 190, tax_rate: null })
    expect(Object.keys(json.invoices[0].values)[0]).toBe('vendor')
  })
})
