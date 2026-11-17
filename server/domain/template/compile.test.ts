import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { compileTemplate, TemplateFieldError } from './compile'
import { DEFAULT_TEMPLATE } from './default-template'
import type { Field } from './fields'

const field = (key: string, type: Field['type'], extra: Partial<Field> = {}): Field =>
  ({ key, label: key, description: `The ${key}`, type, required: false, ...extra }) as Field

describe('compileTemplate', () => {
  it('always asks for an array of Invoices, keyed by Field key', () => {
    const schema = compileTemplate([field('invoice_number', 'text'), field('total', 'number')])
    const parsed = schema.parse({
      invoices: [
        { invoice_number: 'A-1', total: 10 },
        { invoice_number: 'A-2', total: 20.5 },
      ],
    })
    expect(parsed.invoices).toHaveLength(2)
    expect(parsed.invoices[1]).toEqual({ invoice_number: 'A-2', total: 20.5 })
  })

  it('lets every scalar be null so the model never has to invent a missing value', () => {
    const schema = compileTemplate([
      field('note', 'text', { required: true }),
      field('total', 'number'),
      field('paid', 'boolean'),
      field('issue_date', 'date'),
      field('kind', 'enum', { choices: ['invoice', 'credit_note'] }),
      field('amount', 'money'),
    ])
    const allNull = { note: null, total: null, paid: null, issue_date: null, kind: null, amount: null }
    expect(schema.parse({ invoices: [allNull] }).invoices[0]).toEqual(allNull)
  })

  it('rejects values of the wrong type', () => {
    const schema = compileTemplate([field('total', 'number'), field('paid', 'boolean')])
    expect(schema.safeParse({ invoices: [{ total: '12', paid: null }] }).success).toBe(false)
    expect(schema.safeParse({ invoices: [{ total: 12, paid: 'yes' }] }).success).toBe(false)
  })

  it('restricts enums to their choices', () => {
    const schema = compileTemplate([field('kind', 'enum', { choices: ['invoice', 'credit_note'] })])
    expect(schema.safeParse({ invoices: [{ kind: 'credit_note' }] }).success).toBe(true)
    expect(schema.safeParse({ invoices: [{ kind: 'receipt' }] }).success).toBe(false)
  })

  it('compiles money to an amount and an ISO currency', () => {
    const schema = compileTemplate([field('total', 'money')])
    expect(schema.parse({ invoices: [{ total: { amount: 99.5, currency: 'EUR' } }] }).invoices[0]).toEqual({
      total: { amount: 99.5, currency: 'EUR' },
    })
    expect(schema.safeParse({ invoices: [{ total: { amount: '99.5', currency: 'EUR' } }] }).success).toBe(false)
  })

  it('compiles groups to objects and lists to arrays of objects', () => {
    const schema = compileTemplate([
      field('vendor', 'object', { fields: [field('name', 'text'), field('tax_id', 'text')] }),
      field('line_items', 'list', { fields: [field('description', 'text'), field('quantity', 'number')] }),
    ])
    const invoice = {
      vendor: { name: 'Acme', tax_id: null },
      line_items: [
        { description: 'Widget', quantity: 2 },
        { description: 'Gadget', quantity: null },
      ],
    }
    expect(schema.parse({ invoices: [invoice] }).invoices[0]).toEqual(invoice)
    expect(schema.safeParse({ invoices: [{ ...invoice, line_items: [{ description: 1, quantity: 1 }] }] }).success).toBe(
      false,
    )
  })

  it('sends Field labels and descriptions to the model in the JSON schema', () => {
    const schema = compileTemplate([field('total', 'number', { label: 'Total', description: 'Grand total incl. tax' })])
    const json = JSON.stringify(z.toJSONSchema(schema))
    expect(json).toContain('Grand total incl. tax')
    expect(json).toContain('Total')
  })

  it('refuses nesting deeper than two levels', () => {
    const nested = field('outer', 'list', {
      fields: [field('inner', 'object', { fields: [field('x', 'text')] })],
    })
    expect(() => compileTemplate([nested])).toThrow(TemplateFieldError)
  })

  it('refuses duplicate keys, invalid keys, enums without choices and empty groups', () => {
    expect(() => compileTemplate([field('a', 'text'), field('a', 'number')])).toThrow(/duplicate/i)
    expect(() => compileTemplate([field('Total Amount', 'number')])).toThrow(/key/i)
    expect(() => compileTemplate([field('kind', 'enum', { choices: [] })])).toThrow(/choice/i)
    expect(() => compileTemplate([field('vendor', 'object', { fields: [] })])).toThrow(/at least one/i)
    expect(() => compileTemplate([])).toThrow(/at least one/i)
  })

  it('compiles the built-in default Template', () => {
    const schema = compileTemplate(DEFAULT_TEMPLATE.fields)
    const result = schema.safeParse({
      invoices: [
        {
          vendor: { name: 'Acme GmbH', address: 'Hauptstr. 1, Berlin', tax_id: 'DE123456789' },
          buyer: { name: 'Globex', address: null, tax_id: null },
          invoice_number: 'INV-1',
          issue_date: '2026-01-31',
          due_date: null,
          currency: 'EUR',
          line_items: [{ description: 'Consulting', quantity: 2, unit_price: 50, amount: 100, tax_rate: 19 }],
          subtotal: 100,
          tax_total: 19,
          total: 119,
          payment_terms: 'Net 30',
        },
      ],
    })
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true)
  })
})
