import { z } from 'zod'
import { TemplateFieldError, validateTemplateFields } from './compile'
import { FIELD_TYPES, type Field } from './fields'

const fieldShape = z.object({
  key: z.string().max(64),
  label: z.string().trim().min(1, 'needs a label').max(200),
  description: z.string().max(2000).default(''),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().default(false),
  choices: z.array(z.string().trim().min(1).max(200)).max(200).optional(),
  fields: z.array(z.unknown()).max(200).optional(),
})

function parseField(input: unknown, path: string): Field {
  const result = fieldShape.safeParse(input)
  if (!result.success) {
    const issue = result.error.issues[0]!
    const key = typeof (input as { key?: unknown })?.key === 'string' ? (input as { key: string }).key : '?'
    const where = path ? `${path}.${key}` : key
    throw new TemplateFieldError(`Field "${where}" ${issue.path.length ? `${issue.path.join('.')}: ` : ''}${issue.message}`)
  }
  const { key, label, description, type, required, choices, fields } = result.data
  const base = { key, label, description, required }
  if (type === 'enum') return { ...base, type, choices: choices ?? [] }
  if (type === 'object' || type === 'list') {
    const where = path ? `${path}.${key}` : key
    return { ...base, type, fields: (fields ?? []).map((f) => parseField(f, where)) }
  }
  return { ...base, type }
}

/**
 * Turns an untrusted Field tree (from the Templates editor) into Template Fields, or throws a
 * TemplateFieldError meant for the User. Enforces every compiler rule, including the depth of two.
 */
export function parseTemplateFields(input: unknown): Field[] {
  if (!Array.isArray(input)) throw new TemplateFieldError('A Template needs a list of Fields')
  if (input.length > 200) throw new TemplateFieldError('A Template can have at most 200 Fields')
  const fields = input.map((f) => parseField(f, ''))
  validateTemplateFields(fields)
  return fields
}
