/**
 * Flattening Invoices into tables for CSV and XLSX Exports (spec "Export"). Values are always the
 * merged values (Raw overlaid with Corrected); columns come from each Invoice's Template Snapshot.
 */
import { isGroupField, type Field, type InvoiceValues } from '../template/fields'

/** One Invoice to export: its merged values and the Fields of the Template Snapshot it renders with. */
export interface ExportInvoice {
  id: string
  documentId: string
  documentName: string
  /** Order within the Document, from 0. */
  position: number
  templateName: string
  fields: Field[]
  /** Raw Values overlaid with Corrected Values (`mergeValues`). */
  values: InvoiceValues
  reviewedAt: Date | null
}

export type Cell = string | number | boolean | null

export interface Table {
  columns: string[]
  rows: Cell[][]
}

export interface FlatInvoices {
  invoices: Table
  lineItems: Table
}

const META_COLUMNS = ['invoice_id', 'document', 'invoice_in_document', 'template', 'reviewed_at']

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function metaCells(inv: ExportInvoice): Cell[] {
  return [inv.id, inv.documentName, inv.position + 1, inv.templateName, inv.reviewedAt?.toISOString() ?? null]
}

/** Columns in order of first appearance across all Invoices, so mixed Templates share one table. */
class Columns {
  readonly names: string[] = []
  private readonly seen = new Set<string>()
  add(name: string) {
    if (this.seen.has(name)) return
    this.seen.add(name)
    this.names.push(name)
  }
}

/** A primitive stays as is; anything else that does not fit a cell is kept as JSON text. */
function toCell(value: unknown): Cell {
  if (value === undefined || value === null) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  return JSON.stringify(value)
}

function scalarCells(prefix: string, field: Field, value: unknown, out: Map<string, Cell>, columns: Columns) {
  const name = `${prefix}${field.key}`
  if (field.type === 'money') {
    // A value that is not { amount, currency } is kept whole in the amount column.
    const money = isRecord(value) ? value : { amount: value, currency: null }
    columns.add(`${name}.amount`)
    columns.add(`${name}.currency`)
    out.set(`${name}.amount`, toCell(money.amount))
    out.set(`${name}.currency`, toCell(money.currency))
    return
  }
  columns.add(name)
  out.set(name, toCell(value))
}

function headerCells(inv: ExportInvoice, columns: Columns): Map<string, Cell> {
  const cells = new Map<string, Cell>()
  for (const field of inv.fields) {
    if (!isGroupField(field)) {
      scalarCells('', field, inv.values[field.key], cells, columns)
    } else if (field.type === 'object') {
      const group = isRecord(inv.values[field.key]) ? (inv.values[field.key] as Record<string, unknown>) : {}
      for (const child of field.fields) scalarCells(`${field.key}.`, child, group[child.key], cells, columns)
    }
  }
  return cells
}

/** One row's cells per item of every list Field, columns prefixed with the list's key. */
function itemCells(inv: ExportInvoice, columns: Columns): { item: number; cells: Map<string, Cell> }[] {
  const items: { item: number; cells: Map<string, Cell> }[] = []
  for (const field of inv.fields) {
    if (field.type !== 'list') continue
    const list = Array.isArray(inv.values[field.key]) ? (inv.values[field.key] as unknown[]) : []
    list.forEach((entry, index) => {
      const value = isRecord(entry) ? entry : {}
      const cells = new Map<string, Cell>()
      for (const child of field.fields) scalarCells(`${field.key}.`, child, value[child.key], cells, columns)
      items.push({ item: index + 1, cells })
    })
  }
  return items
}

/**
 * The default CSV layout: one row per line item with the Invoice columns repeated on each row.
 * An Invoice without line items still gets one row, with the item columns blank.
 */
export function rowPerLineItem(invoices: ExportInvoice[]): Table {
  const { invoices: header, lineItems } = flattenInvoices(invoices)
  const itemColumns = lineItems.columns.slice(1) // drop invoice_id, already in the Invoice columns
  const blank = itemColumns.map(() => null)
  const itemsByInvoice = new Map<Cell, Cell[][]>()
  for (const row of lineItems.rows) {
    const list = itemsByInvoice.get(row[0]!) ?? []
    list.push(row.slice(1))
    itemsByInvoice.set(row[0]!, list)
  }
  return {
    columns: [...header.columns, ...itemColumns],
    rows: header.rows.flatMap((row) => {
      const items = itemsByInvoice.get(row[0]!) ?? [blank]
      return items.map((item) => [...row, ...item])
    }),
  }
}

export function flattenInvoices(invoices: ExportInvoice[]): FlatInvoices {
  const headerColumns = new Columns()
  const headers = invoices.map((inv) => headerCells(inv, headerColumns))
  const itemColumns = new Columns()
  const items = invoices.map((inv) => itemCells(inv, itemColumns))
  return {
    invoices: {
      columns: [...META_COLUMNS, ...headerColumns.names],
      rows: invoices.map((inv, i) => [
        ...metaCells(inv),
        ...headerColumns.names.map((name) => headers[i]!.get(name) ?? null),
      ]),
    },
    lineItems: {
      columns: ['invoice_id', 'item', ...itemColumns.names],
      rows: invoices.flatMap((inv, i) =>
        items[i]!.map(({ item, cells }) => [inv.id, item, ...itemColumns.names.map((name) => cells.get(name) ?? null)]),
      ),
    },
  }
}
