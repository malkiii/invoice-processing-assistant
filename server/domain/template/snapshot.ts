import type { Field } from './fields'

/**
 * The frozen copy of a Template stored on each Extraction (ADR 0006). Invoices always render
 * against it, never against the Template as later edited.
 */
export interface TemplateSnapshot {
  templateId: string
  name: string
  fields: Field[]
}

export function snapshotTemplate(template: { id: string; name: string; fields: Field[] }): TemplateSnapshot {
  return structuredClone({ templateId: template.id, name: template.name, fields: template.fields })
}
