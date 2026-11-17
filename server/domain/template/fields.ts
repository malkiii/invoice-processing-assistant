/**
 * The Template Field model (spec "Templates"). A Template is an ordered list of Fields; each
 * Field is a scalar, a group (`object`) or a repeating group (`list`). Groups hold scalars only,
 * so the maximum depth is two levels: Invoice → list item → scalars.
 */

export const SCALAR_FIELD_TYPES = ['text', 'number', 'money', 'date', 'boolean', 'enum'] as const
export const GROUP_FIELD_TYPES = ['object', 'list'] as const
export const FIELD_TYPES = [...SCALAR_FIELD_TYPES, ...GROUP_FIELD_TYPES] as const

export type ScalarFieldType = (typeof SCALAR_FIELD_TYPES)[number]
export type GroupFieldType = (typeof GROUP_FIELD_TYPES)[number]
export type FieldType = (typeof FIELD_TYPES)[number]

interface FieldBase {
  /** Stable machine name; the key of the value in Raw Values. snake_case. */
  key: string
  /** Human label shown in the UI. */
  label: string
  /** Instruction to the model on how to find the value. Shown prominently in the editor. */
  description: string
  /** Checked after extraction (a Check), never forced on the model. */
  required: boolean
}

export interface ScalarField extends FieldBase {
  type: Exclude<ScalarFieldType, 'enum'>
}

export interface EnumField extends FieldBase {
  type: 'enum'
  choices: string[]
}

export interface GroupField extends FieldBase {
  type: GroupFieldType
  /** Scalars only (no nested groups). */
  fields: Field[]
}

export type Field = ScalarField | EnumField | GroupField

/** A money value as extracted: an amount and an ISO 4217 currency code. */
export interface MoneyValue {
  amount: number | null
  currency: string | null
}

/** One Invoice's values keyed by Field key, as produced by an Extraction (Raw Values). */
export type InvoiceValues = Record<string, unknown>

export function isGroupField(field: Field): field is GroupField {
  return field.type === 'object' || field.type === 'list'
}

/** The maximum nesting: top-level Fields are depth 1, Fields inside a group depth 2. */
export const MAX_FIELD_DEPTH = 2

export const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/
