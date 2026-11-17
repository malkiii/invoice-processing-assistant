import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMPLATE } from '../template/default-template'
import { mergeValues } from '../template/values'
import { applyCorrection, correctedPaths, FieldCorrectionError } from './values'

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

/** Applies corrections in order and returns the Corrected Values. */
function correct(...edits: [string, unknown][]) {
  return edits.reduce((acc, [path, value]) => applyCorrection(fields, raw, acc, path, value), {} as Record<string, unknown>)
}

describe('applyCorrection', () => {
  it('changes the shown value at every depth while the Raw Values stay untouched', () => {
    const before = structuredClone(raw)
    const corrected = correct(['total', 1200], ['vendor.name', 'ACME'], ['line_items[1].amount', 95])
    const shown = mergeValues(raw, corrected)

    expect(shown.total).toBe(1200)
    expect(shown.vendor).toEqual({ name: 'ACME', address: null, tax_id: 'DE1' })
    expect(shown.line_items).toEqual([
      { description: 'Consulting', quantity: 2, unit_price: 500, amount: 1000, tax_rate: 19 },
      { description: 'Travel', quantity: 1, unit_price: 90, amount: 95, tax_rate: 19 },
    ])
    expect(raw).toEqual(before)
    expect(correctedPaths(fields, raw, corrected).sort()).toEqual(['line_items[1].amount', 'total', 'vendor.name'])
  })

  it('keeps earlier cell edits of the same list', () => {
    const corrected = correct(['line_items[0].amount', 1001], ['line_items[1].description', 'Train'])
    expect(correctedPaths(fields, raw, corrected).sort()).toEqual(['line_items[0].amount', 'line_items[1].description'])
  })

  it('reverts a Field with undefined, leaving other edits', () => {
    const corrected = correct(
      ['total', 1200],
      ['vendor.name', 'X'],
      ['line_items[0].amount', 1],
      ['vendor.name', undefined],
      ['line_items[0].amount', undefined],
    )
    expect(corrected).toEqual({ total: 1200 })
  })

  it('drops the correction when the value equals the Raw Value again', () => {
    expect(correct(['total', 1200], ['total', 1190])).toEqual({})
    expect(correct(['vendor.tax_id', 'X'], ['vendor.tax_id', 'DE1'])).toEqual({})
  })

  it('accepts null to clear a value', () => {
    const corrected = correct(['vendor.tax_id', null])
    expect(mergeValues(raw, corrected).vendor).toMatchObject({ tax_id: null })
    expect(correctedPaths(fields, raw, corrected)).toEqual(['vendor.tax_id'])
  })

  it.each([
    ['an unknown Field', 'nope', 'x'],
    ['a group as a whole', 'vendor', {}],
    ['a list item that does not exist', 'line_items[5].amount', 1],
    ['a list item without an index', 'line_items.amount', 1],
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
