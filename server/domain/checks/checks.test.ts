import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMPLATE } from '../template/default-template'
import type { Field, InvoiceValues } from '../template/fields'
import { duplicateKey, runChecks, type CheckId, type CheckResult } from './index'

const fields = DEFAULT_TEMPLATE.fields

const valid: InvoiceValues = {
  vendor: { name: 'Acme GmbH', address: null, tax_id: null },
  buyer: { name: 'Globex Ltd', address: null, tax_id: null },
  invoice_number: 'INV-1001',
  issue_date: '2026-03-01',
  due_date: '2026-03-31',
  currency: 'EUR',
  line_items: [
    { description: 'Consulting', quantity: 2, unit_price: 500, amount: 1000, tax_rate: 19 },
    { description: 'Travel', quantity: 1, unit_price: 200.1, amount: 200.1, tax_rate: 19 },
  ],
  subtotal: 1200.1,
  tax_total: 228.02,
  total: 1428.12,
  payment_terms: 'Net 30',
}

function check(id: CheckId, values: InvoiceValues, opts: { fields?: Field[]; duplicates?: string[] } = {}): CheckResult {
  const result = runChecks({ fields: opts.fields ?? fields, values, duplicates: opts.duplicates ?? [] }).find(
    (r) => r.id === id,
  )
  if (!result) throw new Error(`no ${id} result`)
  return result
}

describe('line items sum to the subtotal', () => {
  it('passes when the line amounts add up to the subtotal', () => {
    expect(check('line_items_sum', valid)).toMatchObject({ status: 'pass', fields: ['line_items', 'subtotal'] })
  })

  it('fails when they do not, saying both figures', () => {
    const r = check('line_items_sum', { ...valid, subtotal: 1300 })
    expect(r.status).toBe('fail')
    expect(r.message).toContain('1200.10')
    expect(r.message).toContain('1300.00')
  })

  it('tolerates rounding of a cent per line', () => {
    expect(check('line_items_sum', { ...valid, subtotal: 1200.12 }).status).toBe('pass')
    expect(check('line_items_sum', { ...valid, subtotal: 1200.15 }).status).toBe('fail')
  })

  it('is not applicable without line items or without a subtotal', () => {
    expect(check('line_items_sum', { ...valid, line_items: [] }).status).toBe('not_applicable')
    expect(check('line_items_sum', { ...valid, line_items: null }).status).toBe('not_applicable')
    expect(check('line_items_sum', { ...valid, subtotal: null }).status).toBe('not_applicable')
  })

  it('is not applicable when a line has no amount, pointing at that line', () => {
    const items = [{ description: 'A', amount: 1000 }, { description: 'B', amount: null }]
    const r = check('line_items_sum', { ...valid, line_items: items })
    expect(r.status).toBe('not_applicable')
    expect(r.fields).toContain('line_items[1].amount')
  })

  it('fails when money amounts are in different currencies', () => {
    const moneyFields: Field[] = [
      {
        key: 'line_items',
        label: 'Lines',
        description: '',
        type: 'list',
        required: false,
        fields: [{ key: 'amount', label: 'Amount', description: '', type: 'money', required: false }],
      },
      { key: 'subtotal', label: 'Subtotal', description: '', type: 'money', required: false },
    ]
    const values = {
      line_items: [{ amount: { amount: 10, currency: 'EUR' } }, { amount: { amount: 5, currency: 'USD' } }],
      subtotal: { amount: 15, currency: 'EUR' },
    }
    const r = check('line_items_sum', values, { fields: moneyFields })
    expect(r.status).toBe('fail')
    expect(r.message).toMatch(/currenc/)
    const same = { ...values, line_items: [{ amount: { amount: 10, currency: 'EUR' } }, { amount: { amount: 5, currency: 'eur' } }] }
    expect(check('line_items_sum', same, { fields: moneyFields }).status).toBe('pass')
  })

  it('is not applicable for a custom Template without line items', () => {
    const custom = fields.filter((f) => f.key !== 'line_items')
    expect(check('line_items_sum', valid, { fields: custom }).status).toBe('not_applicable')
  })
})

describe('subtotal plus tax equals the total', () => {
  it('passes when they add up', () => {
    expect(check('totals_sum', valid)).toMatchObject({ status: 'pass', fields: ['subtotal', 'tax_total', 'total'] })
  })

  it('fails when they do not', () => {
    const r = check('totals_sum', { ...valid, total: 1500 })
    expect(r.status).toBe('fail')
    expect(r.message).toContain('1428.12')
    expect(r.message).toContain('1500.00')
  })

  it('tolerates rounding', () => {
    expect(check('totals_sum', { ...valid, total: 1428.14 }).status).toBe('pass')
    expect(check('totals_sum', { ...valid, total: 1428.2 }).status).toBe('fail')
  })

  it('counts a tax total of 0', () => {
    expect(check('totals_sum', { ...valid, tax_total: 0, total: 1200.1 }).status).toBe('pass')
  })

  it('is not applicable when any of the three is missing', () => {
    for (const key of ['subtotal', 'tax_total', 'total']) {
      expect(check('totals_sum', { ...valid, [key]: null }).status).toBe('not_applicable')
    }
  })

  it('is not applicable for a custom Template without a tax total', () => {
    const custom = fields.filter((f) => f.key !== 'tax_total')
    expect(check('totals_sum', valid, { fields: custom }).status).toBe('not_applicable')
  })

  it('fails on mixed currencies', () => {
    const m = (key: string): Field => ({ key, label: key, description: '', type: 'money', required: false })
    const values = {
      subtotal: { amount: 100, currency: 'EUR' },
      tax_total: { amount: 19, currency: 'EUR' },
      total: { amount: 119, currency: 'GBP' },
    }
    expect(check('totals_sum', values, { fields: [m('subtotal'), m('tax_total'), m('total')] }).status).toBe('fail')
  })
})

describe('dates are valid and the due date is not before the issue date', () => {
  it('passes for valid dates in order, and for a due date on the issue date', () => {
    expect(check('dates', valid)).toMatchObject({ status: 'pass', fields: ['issue_date', 'due_date'] })
    expect(check('dates', { ...valid, due_date: '2026-03-01' }).status).toBe('pass')
  })

  it('fails when the due date is before the issue date', () => {
    expect(check('dates', { ...valid, due_date: '2026-02-28' })).toMatchObject({
      status: 'fail',
      fields: ['issue_date', 'due_date'],
    })
  })

  it('fails for a date that does not exist or does not parse, naming the Field', () => {
    expect(check('dates', { ...valid, due_date: '2026-02-30' })).toMatchObject({ status: 'fail', fields: ['due_date'] })
    expect(check('dates', { ...valid, issue_date: '01/03/2026' })).toMatchObject({
      status: 'fail',
      fields: ['issue_date'],
    })
  })

  it('checks date Fields inside list items too', () => {
    const custom: Field[] = [
      {
        key: 'deliveries',
        label: 'Deliveries',
        description: '',
        type: 'list',
        required: false,
        fields: [{ key: 'on', label: 'On', description: '', type: 'date', required: false }],
      },
    ]
    const r = check('dates', { deliveries: [{ on: '2026-01-01' }, { on: 'yesterday' }] }, { fields: custom })
    expect(r).toMatchObject({ status: 'fail', fields: ['deliveries[1].on'] })
  })

  it('passes with only an issue date', () => {
    expect(check('dates', { ...valid, due_date: null }).status).toBe('pass')
  })

  it('is not applicable when there are no dates', () => {
    expect(check('dates', { ...valid, issue_date: null, due_date: null }).status).toBe('not_applicable')
    const custom = fields.filter((f) => f.type !== 'date')
    expect(check('dates', valid, { fields: custom }).status).toBe('not_applicable')
  })
})

describe('the currency is a valid ISO 4217 code', () => {
  it('passes for a known code', () => {
    expect(check('currency', valid)).toMatchObject({ status: 'pass', fields: ['currency'] })
    expect(check('currency', { ...valid, currency: 'JPY' }).status).toBe('pass')
  })

  it('fails for a symbol, a name or an unknown code', () => {
    for (const currency of ['€', 'Euro', 'EURO', 'XYZ']) {
      expect(check('currency', { ...valid, currency }).status).toBe('fail')
    }
  })

  it('accepts a lowercase code', () => {
    expect(check('currency', { ...valid, currency: 'usd' }).status).toBe('pass')
  })

  it('is not applicable when no currency is given or the Template has none', () => {
    expect(check('currency', { ...valid, currency: null }).status).toBe('not_applicable')
    const custom = fields.filter((f) => f.key !== 'currency')
    expect(check('currency', valid, { fields: custom }).status).toBe('not_applicable')
  })

  it('checks the currency of money Fields', () => {
    const custom: Field[] = [{ key: 'total', label: 'Total', description: '', type: 'money', required: false }]
    expect(check('currency', { total: { amount: 1, currency: 'EUR' } }, { fields: custom }).status).toBe('pass')
    expect(check('currency', { total: { amount: 1, currency: '$' } }, { fields: custom })).toMatchObject({
      status: 'fail',
      fields: ['total'],
    })
  })
})

describe('required Fields are present', () => {
  it('passes when every required Field has a value', () => {
    expect(check('required_fields', valid).status).toBe('pass')
  })

  it('fails naming each missing Field, at any depth', () => {
    const values = {
      ...valid,
      invoice_number: '  ',
      total: null,
      vendor: { name: null },
      line_items: [{ description: 'A', amount: 1 }, { description: '', amount: 2 }],
    }
    const r = check('required_fields', values)
    expect(r.status).toBe('fail')
    expect(r.fields).toEqual(['vendor.name', 'invoice_number', 'line_items[1].description', 'total'])
    expect(r.message).toContain('Invoice number')
  })

  it('treats 0 and false as present', () => {
    const custom: Field[] = [
      { key: 'total', label: 'Total', description: '', type: 'number', required: true },
      { key: 'paid', label: 'Paid', description: '', type: 'boolean', required: true },
    ]
    expect(check('required_fields', { total: 0, paid: false }, { fields: custom }).status).toBe('pass')
  })

  it('needs an amount in a required money Field and an item in a required list', () => {
    const custom: Field[] = [
      { key: 'total', label: 'Total', description: '', type: 'money', required: true },
      {
        key: 'lines',
        label: 'Lines',
        description: '',
        type: 'list',
        required: true,
        fields: [{ key: 'x', label: 'X', description: '', type: 'text', required: false }],
      },
    ]
    const r = check('required_fields', { total: { amount: null, currency: 'EUR' }, lines: [] }, { fields: custom })
    expect(r).toMatchObject({ status: 'fail', fields: ['total', 'lines'] })
  })

  it('skips the required Fields of an optional group that is absent', () => {
    expect(check('required_fields', { ...valid, buyer: null }).status).toBe('pass')
  })

  it('is not applicable when the Template has no required Fields', () => {
    const custom: Field[] = [{ key: 'note', label: 'Note', description: '', type: 'text', required: false }]
    expect(check('required_fields', {}, { fields: custom }).status).toBe('not_applicable')
  })
})

describe('possible duplicate', () => {
  it('passes when no other Invoice has the same vendor and invoice number', () => {
    expect(check('duplicate', valid)).toMatchObject({ status: 'pass', fields: ['vendor.name', 'invoice_number'] })
  })

  it('fails listing the other Invoices when there are some', () => {
    expect(check('duplicate', valid, { duplicates: ['inv-2', 'inv-3'] })).toMatchObject({
      status: 'fail',
      fields: ['vendor.name', 'invoice_number'],
      relatedInvoiceIds: ['inv-2', 'inv-3'],
    })
  })

  it('is not applicable without a vendor or invoice number', () => {
    expect(check('duplicate', { ...valid, invoice_number: null }).status).toBe('not_applicable')
    expect(check('duplicate', { ...valid, vendor: null }).status).toBe('not_applicable')
    const custom = fields.filter((f) => f.key !== 'invoice_number')
    expect(check('duplicate', valid, { fields: custom }).status).toBe('not_applicable')
  })
})

describe('duplicateKey', () => {
  it('matches the same vendor and invoice number regardless of case and spacing', () => {
    const a = duplicateKey(fields, valid)
    const b = duplicateKey(fields, { ...valid, vendor: { name: ' acme  gmbh ' }, invoice_number: 'inv-1001 ' })
    expect(a).not.toBeNull()
    expect(a).toBe(b)
    expect(duplicateKey(fields, { ...valid, invoice_number: 'INV-1002' })).not.toBe(a)
  })

  it('accepts a plain text vendor Field', () => {
    const custom: Field[] = [
      { key: 'vendor', label: 'Vendor', description: '', type: 'text', required: false },
      { key: 'invoice_number', label: 'No', description: '', type: 'text', required: false },
    ]
    expect(duplicateKey(custom, { vendor: 'Acme GmbH', invoice_number: 'INV-1001' })).toBe(duplicateKey(fields, valid))
  })

  it('is null when either is missing', () => {
    expect(duplicateKey(fields, { ...valid, invoice_number: '' })).toBeNull()
  })
})

describe('runChecks', () => {
  it('returns every Check once, in a fixed order', () => {
    expect(runChecks({ fields, values: valid, duplicates: [] }).map((r) => [r.id, r.status])).toEqual([
      ['line_items_sum', 'pass'],
      ['totals_sum', 'pass'],
      ['dates', 'pass'],
      ['currency', 'pass'],
      ['required_fields', 'pass'],
      ['duplicate', 'pass'],
    ])
  })

  it('degrades to not applicable for an empty Invoice on a Template with no known Fields', () => {
    const custom: Field[] = [{ key: 'note', label: 'Note', description: '', type: 'text', required: false }]
    expect(runChecks({ fields: custom, values: {}, duplicates: [] }).every((r) => r.status === 'not_applicable')).toBe(
      true,
    )
  })
})
