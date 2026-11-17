import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMPLATE } from '../template/default-template'
import type { Field } from '../template/fields'
import { flattenInvoices, rowPerLineItem, type ExportInvoice } from './flatten'

function exportInvoice(values: Record<string, unknown>, overrides: Partial<ExportInvoice> = {}): ExportInvoice {
  return {
    id: 'inv-1',
    documentId: 'doc-1',
    documentName: 'acme.pdf',
    position: 0,
    templateName: 'Invoice (default)',
    fields: DEFAULT_TEMPLATE.fields,
    values,
    reviewedAt: null,
    ...overrides,
  }
}

const acme = {
  vendor: { name: 'Acme GmbH', address: 'Hauptstr. 1, Berlin', tax_id: 'DE123' },
  buyer: { name: 'Globex', address: null, tax_id: null },
  invoice_number: 'INV-1001',
  issue_date: '2026-03-01',
  due_date: null,
  currency: 'EUR',
  line_items: [
    { description: 'Consulting', quantity: 2, unit_price: 500, amount: 1000, tax_rate: 19 },
    { description: 'Travel', quantity: null, unit_price: null, amount: 150, tax_rate: 19 },
  ],
  subtotal: 1150,
  tax_total: 218.5,
  total: 1368.5,
  payment_terms: 'Net 30',
}

describe('flattenInvoices', () => {
  it('gives one Invoices row per Invoice, with group Fields as dotted columns and lists left out', () => {
    const { invoices } = flattenInvoices([
      exportInvoice(acme, { reviewedAt: new Date('2026-03-05T10:00:00.000Z') }),
    ])
    expect(invoices.columns).toEqual([
      'invoice_id',
      'document',
      'invoice_in_document',
      'template',
      'reviewed_at',
      'vendor.name',
      'vendor.address',
      'vendor.tax_id',
      'buyer.name',
      'buyer.address',
      'buyer.tax_id',
      'invoice_number',
      'issue_date',
      'due_date',
      'currency',
      'subtotal',
      'tax_total',
      'total',
      'payment_terms',
    ])
    expect(invoices.rows).toEqual([
      [
        'inv-1',
        'acme.pdf',
        1,
        'Invoice (default)',
        '2026-03-05T10:00:00.000Z',
        'Acme GmbH',
        'Hauptstr. 1, Berlin',
        'DE123',
        'Globex',
        null,
        null,
        'INV-1001',
        '2026-03-01',
        null,
        'EUR',
        1150,
        218.5,
        1368.5,
        'Net 30',
      ],
    ])
  })

  it('gives one Line items row per list item, linked by invoice_id and numbered from 1', () => {
    const { lineItems } = flattenInvoices([exportInvoice(acme)])
    expect(lineItems).toEqual({
      columns: [
        'invoice_id',
        'item',
        'line_items.description',
        'line_items.quantity',
        'line_items.unit_price',
        'line_items.amount',
        'line_items.tax_rate',
      ],
      rows: [
        ['inv-1', 1, 'Consulting', 2, 500, 1000, 19],
        ['inv-1', 2, 'Travel', null, null, 150, 19],
      ],
    })
  })
})

describe('rowPerLineItem', () => {
  it('repeats the Invoice columns on each line item row, and gives an Invoice without line items one row', () => {
    const noItems = exportInvoice(
      { ...acme, invoice_number: 'INV-1002', line_items: [] },
      { id: 'inv-2', position: 1 },
    )
    const table = rowPerLineItem([exportInvoice(acme), noItems])
    const pick = (row: unknown[], ...names: string[]) => names.map((n) => row[table.columns.indexOf(n)])
    expect(table.columns.slice(-6)).toEqual([
      'item',
      'line_items.description',
      'line_items.quantity',
      'line_items.unit_price',
      'line_items.amount',
      'line_items.tax_rate',
    ])
    expect(table.rows.map((row) => pick(row, 'invoice_id', 'invoice_number', 'total', 'item', 'line_items.description'))).toEqual([
      ['inv-1', 'INV-1001', 1368.5, 1, 'Consulting'],
      ['inv-1', 'INV-1001', 1368.5, 2, 'Travel'],
      ['inv-2', 'INV-1002', 1368.5, null, null],
    ])
  })

  it('gives an Invoice whose line items Field is missing or not a list one row', () => {
    const { line_items: _, ...withoutList } = acme
    const table = rowPerLineItem([
      exportInvoice(withoutList),
      exportInvoice({ ...acme, line_items: 'garbled' }, { id: 'inv-2' }),
    ])
    expect(table.rows).toHaveLength(2)
    expect(table.rows.map((row) => row[table.columns.indexOf('item')])).toEqual([null, null])
  })
})

const f = (key: string, type: Field['type'], extra: Partial<Field> = {}): Field =>
  ({ key, label: key, description: '', required: false, type, ...extra }) as Field

const receiptFields: Field[] = [
  f('merchant', 'text'),
  f('paid', 'boolean'),
  f('method', 'enum', { choices: ['card', 'cash'] } as Partial<Field>),
  f('amount_due', 'money'),
  f('shop', 'object', { fields: [f('city', 'text'), f('deposit', 'money')] } as Partial<Field>),
  f('items', 'list', { fields: [f('sku', 'text'), f('price', 'money')] } as Partial<Field>),
  f('fees', 'list', { fields: [f('label', 'text'), f('price', 'money')] } as Partial<Field>),
]

const receipt = exportInvoice(
  {
    merchant: 'Corner Café',
    paid: true,
    method: 'card',
    amount_due: { amount: 12.5, currency: 'EUR' },
    shop: { city: 'Lyon', deposit: { amount: null, currency: 'EUR' } },
    items: [{ sku: 'A1', price: { amount: 10, currency: 'EUR' } }],
    fees: [{ label: 'Service', price: { amount: 2.5, currency: 'EUR' } }],
    not_in_template: 'ignored',
  },
  { id: 'rec-1', templateName: 'Receipt', fields: receiptFields },
)

describe('flattenInvoices with custom Template Fields', () => {
  it('splits money into amount and currency columns, at every depth', () => {
    const { invoices, lineItems } = flattenInvoices([receipt])
    expect(invoices.columns.slice(5)).toEqual([
      'merchant',
      'paid',
      'method',
      'amount_due.amount',
      'amount_due.currency',
      'shop.city',
      'shop.deposit.amount',
      'shop.deposit.currency',
    ])
    expect(invoices.rows[0]!.slice(5)).toEqual(['Corner Café', true, 'card', 12.5, 'EUR', 'Lyon', null, 'EUR'])
    expect(lineItems).toEqual({
      columns: ['invoice_id', 'item', 'items.sku', 'items.price.amount', 'items.price.currency', 'fees.label', 'fees.price.amount', 'fees.price.currency'],
      rows: [
        ['rec-1', 1, 'A1', 10, 'EUR', null, null, null],
        ['rec-1', 1, null, null, null, 'Service', 2.5, 'EUR'],
      ],
    })
  })

  it('shares one set of columns between Invoices of different Templates, blank where a Field is absent', () => {
    const { invoices } = flattenInvoices([exportInvoice(acme), receipt])
    const col = (name: string) => invoices.rows.map((row) => row[invoices.columns.indexOf(name)])
    expect(col('template')).toEqual(['Invoice (default)', 'Receipt'])
    expect(col('invoice_number')).toEqual(['INV-1001', null])
    expect(col('merchant')).toEqual([null, 'Corner Café'])
    expect(invoices.columns.filter((c) => c === 'currency')).toHaveLength(1)
  })

  it('keeps a value that does not fit its Field type as JSON text rather than dropping it', () => {
    const { invoices } = flattenInvoices([
      exportInvoice({ ...acme, total: { gross: 10 }, vendor: 'Acme as a string' }),
    ])
    const col = (name: string) => invoices.rows[0]![invoices.columns.indexOf(name)]
    expect(col('total')).toBe('{"gross":10}')
    expect(col('vendor.name')).toBeNull()
  })
})
