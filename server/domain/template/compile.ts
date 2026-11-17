import { z } from 'zod'
import { FIELD_KEY_PATTERN, isGroupField, MAX_FIELD_DEPTH, type Field, type InvoiceValues } from './fields'

/** A Field tree that cannot be compiled. The message is meant for the User editing the Template. */
export class TemplateFieldError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TemplateFieldError'
  }
}

/** The schema handed to the model: always an object wrapping an array of Invoices. */
export type InvoicesSchema = z.ZodType<{ invoices: InvoiceValues[] }>

function describe(field: Field): string {
  const required = field.required ? ' (required)' : ''
  return field.description ? `${field.label}${required}: ${field.description}` : `${field.label}${required}`
}

function scalar(field: Field): z.ZodType {
  switch (field.type) {
    case 'text':
      return z.string()
    case 'number':
      return z.number()
    case 'boolean':
      return z.boolean()
    case 'date':
      return z.string().describe('ISO 8601 date, YYYY-MM-DD')
    case 'enum':
      return z.enum(field.choices as [string, ...string[]])
    case 'money':
      return z.object({
        amount: z.number().nullable().describe('The amount as a plain number, without currency symbols'),
        currency: z.string().nullable().describe('ISO 4217 currency code, e.g. EUR'),
      })
    default:
      throw new TemplateFieldError(`Field "${field.key}" has an unknown type`)
  }
}

function validateFields(fields: Field[], depth: number, path: string) {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new TemplateFieldError(`${path || 'A Template'} needs at least one Field`)
  }
  const seen = new Set<string>()
  for (const field of fields) {
    const where = path ? `${path}.${field.key}` : field.key
    if (typeof field.key !== 'string' || !FIELD_KEY_PATTERN.test(field.key)) {
      throw new TemplateFieldError(
        `Field key "${field.key}" is invalid: use lowercase letters, digits and underscores, starting with a letter`,
      )
    }
    if (seen.has(field.key)) throw new TemplateFieldError(`Field key "${where}" is a duplicate`)
    seen.add(field.key)
    if (field.type === 'enum' && (!Array.isArray(field.choices) || field.choices.length === 0)) {
      throw new TemplateFieldError(`Enum Field "${where}" needs at least one choice`)
    }
    if (isGroupField(field)) {
      if (depth >= MAX_FIELD_DEPTH) {
        throw new TemplateFieldError(`Field "${where}" nests too deeply: groups and lists can hold scalar Fields only`)
      }
      validateFields(field.fields, depth + 1, `Field "${where}"`)
    }
  }
}

function objectOf(fields: Field[]): z.ZodObject {
  const shape: Record<string, z.ZodType> = {}
  for (const field of fields) shape[field.key] = compileField(field)
  return z.object(shape)
}

function compileField(field: Field): z.ZodType {
  if (field.type === 'list') return z.array(objectOf(field.fields)).describe(describe(field))
  if (field.type === 'object') return objectOf(field.fields).describe(describe(field))
  // Every scalar may be null: a missing value is reported, never invented. `required` is a Check.
  return scalar(field).nullable().describe(describe(field))
}

/** Throws TemplateFieldError when the Field tree is not a valid Template. */
export function validateTemplateFields(fields: Field[]): void {
  validateFields(fields, 1, '')
}

/**
 * Compiles a Template's Fields into the Zod schema passed to the model (spec "Templates"):
 * `{ invoices: Invoice[] }`, so a Document holding several invoices yields several Invoices.
 */
export function compileTemplate(fields: Field[]): InvoicesSchema {
  validateTemplateFields(fields)
  return z.object({
    invoices: z
      .array(objectOf(fields))
      .describe('Every distinct invoice found in the document, in the order they appear'),
  }) as unknown as InvoicesSchema
}
