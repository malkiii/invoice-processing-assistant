import { describe, expect, it } from 'vitest'
import { TemplateFieldError } from './compile'
import { DEFAULT_TEMPLATE } from './default-template'
import { parseTemplateFields } from './parse'

const scalar = (key: string, extra: Record<string, unknown> = {}) => ({
  key,
  label: key,
  description: `The ${key}`,
  type: 'text',
  required: false,
  ...extra,
})

describe('parseTemplateFields', () => {
  it('accepts the built-in default Template', () => {
    expect(parseTemplateFields(structuredClone(DEFAULT_TEMPLATE.fields))).toEqual(DEFAULT_TEMPLATE.fields)
  })

  it('keeps only the known properties of each Field, in order', () => {
    const parsed = parseTemplateFields([
      { ...scalar('total', { type: 'number' }), extra: 'dropped' },
      scalar('kind', { type: 'enum', choices: ['invoice', 'credit_note'], fields: [scalar('x')] }),
      scalar('items', { type: 'list', choices: ['nope'], fields: [scalar('description')] }),
    ])
    expect(parsed).toEqual([
      { key: 'total', label: 'total', description: 'The total', type: 'number', required: false },
      { key: 'kind', label: 'kind', description: 'The kind', type: 'enum', required: false, choices: ['invoice', 'credit_note'] },
      {
        key: 'items',
        label: 'items',
        description: 'The items',
        type: 'list',
        required: false,
        fields: [{ key: 'description', label: 'description', description: 'The description', type: 'text', required: false }],
      },
    ])
  })

  it('refuses a group inside a group: the depth limit is two levels', () => {
    const tooDeep = [scalar('outer', { type: 'object', fields: [scalar('inner', { type: 'list', fields: [scalar('x')] })] })]
    expect(() => parseTemplateFields(tooDeep)).toThrow(TemplateFieldError)
    expect(() => parseTemplateFields(tooDeep)).toThrow(/nests too deeply/)
  })

  it('refuses unknown types, missing labels and malformed input with a readable message', () => {
    expect(() => parseTemplateFields([scalar('a', { type: 'currency' })])).toThrow(TemplateFieldError)
    expect(() => parseTemplateFields([scalar('a', { label: '  ' })])).toThrow(/label/i)
    expect(() => parseTemplateFields('nope')).toThrow(TemplateFieldError)
    expect(() => parseTemplateFields([scalar('a', { required: 'yes' })])).toThrow(TemplateFieldError)
  })

  it('applies the compiler rules: keys, duplicates, enum choices and empty groups', () => {
    expect(() => parseTemplateFields([scalar('Bad Key')])).toThrow(/key/i)
    expect(() => parseTemplateFields([scalar('a'), scalar('a')])).toThrow(/duplicate/i)
    expect(() => parseTemplateFields([scalar('k', { type: 'enum', choices: [] })])).toThrow(/choice/i)
    expect(() => parseTemplateFields([scalar('g', { type: 'object', fields: [] })])).toThrow(/at least one/i)
    expect(() => parseTemplateFields([])).toThrow(/at least one/i)
  })
})
