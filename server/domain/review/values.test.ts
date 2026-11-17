import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMPLATE } from '../template/default-template'
import { applyCorrection, FieldCorrectionError, mergeInvoiceValues } from './values'

const raw = {
  vendor: { name: 'Acme GmbH', address: null, tax_id: 'DE1' },
  invoice_number: 'INV-1',
  issue_date: '2026-03-01',
  total: 1190,
  line_items: [
    { description: 'Consulting', quantity: 2, unit_price: 500, amount: 1000, tax_rate: 19 },
    { description: 'Travel', quantity: 1, unit_price: 90, amount: 90, tax_rate: 19 },
  ],
}
const fields = DEFAULT_TEMPLATE.fields

describe('mergeInvoiceValues', () => {
  it('returns the Raw Values when there are no Corrected Values', () => {
    expect(mergeInvoiceValues(raw, {})).toEqual(raw)
  })

  it('overlays Corrected Values by Field path, at every depth, without touching the Raw Values', () => {
    const before = structuredClone(raw)
    const merged = mergeInvoiceValues(raw, { total: 1200, 'vendor.name': 'ACME', 'line_items.1.amount': 95 })
    expect(merged.total).toBe(1200)
    expect(merged.vendor).toEqual({ name: 'ACME', address: null, tax_id: 'DE1' })
    expect(merged.line_items).toEqual([
      { description: 'Consulting', quantity: 2, unit_price: 500, amount: 1000, tax_rate: 19 },
      { description: 'Travel', quantity: 1, unit_price: 90, amount: 95, tax_rate: 19 },
    ])
    expect(raw).toEqual(before)
  })

  it('fills a group the model left out', () => {
    const merged = mergeInvoiceValues({ vendor: null }, { 'vendor.name': 'Acme' })
    expect(merged.vendor).toEqual({ name: 'Acme' })
  })
})

describe('applyCorrection', () => {
  it('records a corrected scalar', () => {
    expect(applyCorrection(fields, raw, {}, 'invoice_number', 'INV-9')).toEqual({ invoice_number: 'INV-9' })
  })

  it('drops the correction when the value equals the Raw Value again', () => {
    expect(applyCorrection(fields, raw, { total: 1200 }, 'total', 1190)).toEqual({})
  })

  it('reverts a Field when the value is undefined', () => {
    expect(applyCorrection(fields, raw, { total: 1200, 'vendor.name': 'X' }, 'total', undefined)).toEqual({
      'vendor.name': 'X',
    })
  })

  it('accepts null to clear a value', () => {
    expect(applyCorrection(fields, raw, {}, 'vendor.tax_id', null)).toEqual({ 'vendor.tax_id': null })
  })

  it.each([
    ['an unknown Field', 'nope', 'x'],
    ['a group as a whole', 'vendor', {}],
    ['a list item that does not exist', 'line_items.5.amount', 1],
    ['a non-numeric list index', 'line_items.a.amount', 1],
    ['a number Field given text', 'total', 'lots'],
    ['a date Field given a non-date', 'issue_date', '03/01/2026'],
    ['a text Field given a number', 'invoice_number', 12],
  ])('rejects %s', (_label, path, value) => {
    expect(() => applyCorrection(fields, raw, {}, path, value)).toThrow(FieldCorrectionError)
  })

  it('validates enum and money Fields', () => {
    const custom = [
      { key: 'kind', label: 'Kind', description: '', required: false, type: 'enum' as const, choices: ['a', 'b'] },
      { key: 'fee', label: 'Fee', description: '', required: false, type: 'money' as const },
    ]
    expect(applyCorrection(custom, {}, {}, 'kind', 'b')).toEqual({ kind: 'b' })
    expect(() => applyCorrection(custom, {}, {}, 'kind', 'c')).toThrow(FieldCorrectionError)
    expect(applyCorrection(custom, {}, {}, 'fee', { amount: 5, currency: 'EUR' })).toEqual({
      fee: { amount: 5, currency: 'EUR' },
    })
    expect(() => applyCorrection(custom, {}, {}, 'fee', 5)).toThrow(FieldCorrectionError)
  })
})
