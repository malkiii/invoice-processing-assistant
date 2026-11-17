/**
 * Rendering Invoices as an Export file (spec "Export"): CSV (one row per line item, or a zip of
 * `invoices.csv` + `line_items.csv`), XLSX (Invoices and Line items sheets) or nested JSON.
 */
import JSZip from 'jszip'
import { isGroupField } from '../template/fields'
import { flattenInvoices, isRecord, rowPerLineItem, type Cell, type ExportInvoice, type Table } from './flatten'

export const EXPORT_FORMATS = ['csv', 'xlsx', 'json'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

/** `rows`: one row per line item (default). `zip`: `invoices.csv` + `line_items.csv`. */
export const CSV_LAYOUTS = ['rows', 'zip'] as const
export type CsvLayout = (typeof CSV_LAYOUTS)[number]

export interface ExportOptions {
  format: ExportFormat
  csvLayout?: CsvLayout
}

export interface RenderedExport {
  bytes: Uint8Array
  contentType: string
  extension: 'csv' | 'zip' | 'xlsx' | 'json'
}

const encoder = new TextEncoder()

function zipBytes(zip: JSZip): Promise<Uint8Array> {
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

// --- CSV ---

/** Spreadsheets run a cell starting with one of these as a formula (CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/

function csvCell(cell: Cell): string {
  if (cell === null) return ''
  if (typeof cell !== 'string') return String(cell)
  const text = FORMULA_START.test(cell) ? `'${cell}` : cell
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** RFC 4180 CSV with CRLF line ends and a UTF-8 BOM, so Excel opens non-ASCII text correctly. */
export function toCsv(table: Table): string {
  const lines = [table.columns, ...table.rows].map((row) => row.map(csvCell).join(','))
  return `﻿${lines.map((line) => `${line}\r\n`).join('')}`
}

// --- XLSX (minimal SpreadsheetML with inline strings) ---

/** Characters XML 1.0 does not allow, even escaped. */
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g

function xml(text: string): string {
  return text
    .replace(XML_INVALID, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function columnName(index: number): string {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  return name
}

function xlsxCell(cell: Cell, ref: string): string {
  if (cell === null) return ''
  if (typeof cell === 'number') return `<c r="${ref}"><v>${cell}</v></c>`
  if (typeof cell === 'boolean') return `<c r="${ref}" t="b"><v>${cell ? 1 : 0}</v></c>`
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(cell)}</t></is></c>`
}

function worksheet(table: Table): string {
  const rows = [table.columns, ...table.rows].map((row, r) => {
    const cells = row.map((cell, c) => xlsxCell(cell, `${columnName(c)}${r + 1}`)).join('')
    return `<row r="${r + 1}">${cells}</row>`
  })
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<sheetData>${rows.join('')}</sheetData></worksheet>`
  )
}

async function toXlsx(sheets: { name: string; table: Table }[]): Promise<Uint8Array> {
  const zip = new JSZip()
  const sheetPath = (i: number) => `xl/worksheets/sheet${i + 1}.xml`
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets
        .map((_, i) => `<Override PartName="/${sheetPath(i)}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join('') +
      '</Types>',
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',
  )
  zip.file(
    'xl/workbook.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
      '</workbook>',
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join('') +
      '</Relationships>',
  )
  sheets.forEach((s, i) => zip.file(sheetPath(i), worksheet(s.table)))
  return zipBytes(zip)
}

// --- JSON ---

/** The merged values restricted to the Template Snapshot's Fields, in Template order. */
function templateValues(inv: ExportInvoice): Record<string, unknown> {
  return Object.fromEntries(
    inv.fields.map((field) => {
      const value = inv.values[field.key] ?? null
      if (!isGroupField(field) || value === null) return [field.key, value]
      const pick = (entry: unknown) =>
        isRecord(entry) ? Object.fromEntries(field.fields.map((c) => [c.key, entry[c.key] ?? null]))
          : entry
      return [field.key, field.type === 'list' && Array.isArray(value) ? value.map(pick) : pick(value)]
    }),
  )
}

function toJson(invoices: ExportInvoice[]): string {
  return JSON.stringify(
    {
      invoices: invoices.map((inv) => ({
        invoice_id: inv.id,
        document: { id: inv.documentId, name: inv.documentName },
        invoice_in_document: inv.position + 1,
        template: inv.templateName,
        reviewed_at: inv.reviewedAt?.toISOString() ?? null,
        values: templateValues(inv),
      })),
    },
    null,
    2,
  )
}

// --- Entry point ---

export async function renderExport(invoices: ExportInvoice[], options: ExportOptions): Promise<RenderedExport> {
  switch (options.format) {
    case 'json':
      return { bytes: encoder.encode(toJson(invoices)), contentType: 'application/json', extension: 'json' }
    case 'xlsx': {
      const { invoices: header, lineItems } = flattenInvoices(invoices)
      return {
        bytes: await toXlsx([
          { name: 'Invoices', table: header },
          { name: 'Line items', table: lineItems },
        ]),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        extension: 'xlsx',
      }
    }
    case 'csv': {
      if (options.csvLayout !== 'zip') {
        return { bytes: encoder.encode(toCsv(rowPerLineItem(invoices))), contentType: 'text/csv; charset=utf-8', extension: 'csv' }
      }
      const { invoices: header, lineItems } = flattenInvoices(invoices)
      const zip = new JSZip()
      zip.file('invoices.csv', toCsv(header))
      zip.file('line_items.csv', toCsv(lineItems))
      return {
        bytes: await zipBytes(zip),
        contentType: 'application/zip',
        extension: 'zip',
      }
    }
  }
}
