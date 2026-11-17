/**
 * Editing state for the Templates editor. Draft Fields carry a local `uid` (for list keys and
 * drag-and-drop) that never leaves the browser; `toFields` strips it before preview and save.
 */
import type { Field, FieldType } from '~~/server/domain/template/fields'

export interface DraftField {
  uid: string
  key: string
  /** True once the User typed the key, so it stops following the label. */
  keyEdited: boolean
  label: string
  description: string
  type: FieldType
  required: boolean
  choices: string[]
  fields: DraftField[]
}

export interface TemplateDto {
  id: string
  userId: string | null
  name: string
  fields: Field[]
  builtIn: boolean
  isDefault?: boolean
}

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Text',
  number: 'Number',
  money: 'Money (amount + currency)',
  date: 'Date',
  boolean: 'Yes / no',
  enum: 'Choice',
  object: 'Group',
  list: 'List (repeating group)',
}

let counter = 0
const nextUid = () => `f${++counter}`

export function newDraftField(): DraftField {
  return {
    uid: nextUid(),
    key: '',
    keyEdited: false,
    label: '',
    description: '',
    type: 'text',
    required: false,
    choices: [],
    fields: [],
  }
}

export function toDraft(fields: Field[]): DraftField[] {
  return fields.map((f) => ({
    uid: nextUid(),
    key: f.key,
    keyEdited: true,
    label: f.label,
    description: f.description,
    type: f.type,
    required: f.required,
    choices: f.type === 'enum' ? [...f.choices] : [],
    fields: f.type === 'object' || f.type === 'list' ? toDraft(f.fields) : [],
  }))
}

export function toFields(draft: DraftField[]): Field[] {
  return draft.map((d): Field => {
    const base = { key: d.key.trim(), label: d.label.trim(), description: d.description.trim(), required: d.required }
    if (d.type === 'enum') return { ...base, type: d.type, choices: d.choices.map((c) => c.trim()).filter(Boolean) }
    if (d.type === 'object' || d.type === 'list') return { ...base, type: d.type, fields: toFields(d.fields) }
    return { ...base, type: d.type }
  })
}

/** A snake_case key suggested from a label, used until the User edits the key themselves. */
export function keyFromLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+|_+$/g, '')
    .slice(0, 64)
}
