import { describe, expect, it } from 'vitest'
import { resolveCursorEffect } from '../../../app/lib/cursor-effects/selection'

describe('resolveCursorEffect', () => {
  it('uses the ?cursor= value when it names an effect', () => {
    expect(resolveCursorEffect({ query: 'stamp', stored: null })).toBe('stamp')
  })

  it('lets the URL win over the remembered choice', () => {
    expect(resolveCursorEffect({ query: 'ruler', stored: 'lens' })).toBe('ruler')
  })

  it('falls back to the remembered choice when the URL has none', () => {
    expect(resolveCursorEffect({ query: undefined, stored: 'scanner' })).toBe('scanner')
  })

  it('ignores unknown values in the URL and in storage', () => {
    expect(resolveCursorEffect({ query: 'confetti', stored: 'particles' })).toBe('particles')
    expect(resolveCursorEffect({ query: 'confetti', stored: 'bogus' })).toBe('lens')
  })

  it('accepts "off" as an explicit choice', () => {
    expect(resolveCursorEffect({ query: 'off', stored: 'receipt' })).toBe('off')
  })

  it('takes the first value when the query param repeats', () => {
    expect(resolveCursorEffect({ query: ['receipt', 'stamp'], stored: null })).toBe('receipt')
  })
})
