/**
 * Reading Templates. A User sees their own Templates plus the built-in default (ADR 0006: Templates
 * are freely editable; Extractions keep a snapshot). Editing lives with the Templates editor (issue 09).
 */
import { and, eq, isNull, or } from 'drizzle-orm'
import type { Database } from '../db/client'
import { template } from '../db/schema'
import { DEFAULT_TEMPLATE, DEFAULT_TEMPLATE_ID } from './template/default-template'
import type { Field } from './template/fields'

export interface TemplateRecord {
  id: string
  /** Null for the built-in default Template. */
  userId: string | null
  name: string
  fields: Field[]
  builtIn: boolean
}

type TemplateRow = typeof template.$inferSelect

function toRecord(row: TemplateRow): TemplateRecord {
  return { id: row.id, userId: row.userId, name: row.name, fields: row.fields, builtIn: row.userId === null }
}

/** Creates or refreshes the built-in default Template row from code. Runs with every migration. */
export async function seedBuiltInTemplate(db: Pick<Database, 'insert'>): Promise<void> {
  await db
    .insert(template)
    .values({ id: DEFAULT_TEMPLATE_ID, userId: null, name: DEFAULT_TEMPLATE.name, fields: DEFAULT_TEMPLATE.fields })
    .onConflictDoUpdate({
      target: template.id,
      set: { name: DEFAULT_TEMPLATE.name, fields: DEFAULT_TEMPLATE.fields, updatedAt: new Date() },
    })
}

/** A Template the User may use: their own, or the built-in one. Null for anything else. */
export async function findUsableTemplate(db: Database, userId: string, templateId: string): Promise<TemplateRecord | null> {
  const [row] = await db
    .select()
    .from(template)
    .where(and(eq(template.id, templateId), or(eq(template.userId, userId), isNull(template.userId))))
  return row ? toRecord(row) : null
}

/** The Template to extract with: the requested one, else the built-in default (also used when the row is missing). */
export async function resolveTemplate(db: Database, userId: string, templateId: string | null): Promise<TemplateRecord | null> {
  if (templateId) return findUsableTemplate(db, userId, templateId)
  const builtIn = await findUsableTemplate(db, userId, DEFAULT_TEMPLATE_ID)
  return builtIn ?? { ...DEFAULT_TEMPLATE, userId: null, builtIn: true }
}
