/**
 * Templates (ADR 0006): a User sees and uses their own Templates plus the built-in default, and edits
 * their own freely; Extractions keep a Template Snapshot, so editing never changes old Invoices.
 */
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm'
import type { Database } from '../db/client'
import { template } from '../db/schema'
import { TemplateFieldError } from './template/compile'
import { DEFAULT_TEMPLATE, DEFAULT_TEMPLATE_ID } from './template/default-template'
import type { Field } from './template/fields'
import { parseTemplateFields } from './template/parse'

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

// --- Editing (issue 09). Only a User's own Templates change; the built-in row is read-only. ---

/** Input the User can fix: a bad name, invalid Fields or an attempt to change the built-in Template. */
export class TemplateInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TemplateInputError'
  }
}

export interface TemplateInput {
  name: string
  /** Untrusted Field tree from the editor; validated with parseTemplateFields. */
  fields: unknown
}

function parseName(name: string): string {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (!trimmed) throw new TemplateInputError('A Template needs a name')
  if (trimmed.length > 200) throw new TemplateInputError('A Template name can be at most 200 characters')
  return trimmed
}

function parseFields(fields: unknown): Field[] {
  try {
    return parseTemplateFields(fields)
  } catch (error) {
    if (error instanceof TemplateFieldError) throw new TemplateInputError(error.message)
    throw error
  }
}

function refuseBuiltIn(templateId: string) {
  if (templateId === DEFAULT_TEMPLATE_ID) {
    throw new TemplateInputError('The built-in default Template is read-only: clone it to make changes')
  }
}

/** The built-in default first, then the User's own Templates by name. */
export async function listTemplates(db: Database, userId: string): Promise<TemplateRecord[]> {
  const rows = await db
    .select()
    .from(template)
    .where(or(eq(template.userId, userId), isNull(template.userId)))
    .orderBy(sql`${template.userId} is not null`, asc(template.name), asc(template.createdAt))
  return rows.map(toRecord)
}

export async function createTemplate(db: Database, userId: string, input: TemplateInput): Promise<TemplateRecord> {
  const values = { userId, name: parseName(input.name), fields: parseFields(input.fields) }
  const [row] = await db.insert(template).values(values).returning()
  return toRecord(row!)
}

/** Copies a usable Template (own or built-in) into a new Template of the User's own. Null if not usable. */
export async function cloneTemplate(db: Database, userId: string, sourceId: string): Promise<TemplateRecord | null> {
  const source = await findUsableTemplate(db, userId, sourceId)
  if (!source) return null
  const name = `${source.name} (copy)`.slice(0, 200)
  const [row] = await db.insert(template).values({ userId, name, fields: structuredClone(source.fields) }).returning()
  return toRecord(row!)
}

/**
 * Changes an own Template in place. Existing Extractions are untouched: they render from their
 * Template Snapshot (ADR 0006). Null when the User has no such Template.
 */
export async function updateTemplate(
  db: Database,
  userId: string,
  templateId: string,
  changes: Partial<TemplateInput>,
): Promise<TemplateRecord | null> {
  refuseBuiltIn(templateId)
  const set: Partial<typeof template.$inferInsert> = {}
  if (changes.name !== undefined) set.name = parseName(changes.name)
  if (changes.fields !== undefined) set.fields = parseFields(changes.fields)
  if (Object.keys(set).length === 0) return findOwnTemplate(db, userId, templateId)
  const [row] = await db
    .update(template)
    .set({ ...set, updatedAt: new Date() })
    .where(and(eq(template.id, templateId), eq(template.userId, userId)))
    .returning()
  return row ? toRecord(row) : null
}

/** Deletes an own Template. A default pointing at it falls back to the built-in (FK set null). */
export async function deleteTemplate(db: Database, userId: string, templateId: string): Promise<boolean> {
  refuseBuiltIn(templateId)
  const deleted = await db
    .delete(template)
    .where(and(eq(template.id, templateId), eq(template.userId, userId)))
    .returning({ id: template.id })
  return deleted.length > 0
}

async function findOwnTemplate(db: Database, userId: string, templateId: string): Promise<TemplateRecord | null> {
  const [row] = await db
    .select()
    .from(template)
    .where(and(eq(template.id, templateId), eq(template.userId, userId)))
  return row ? toRecord(row) : null
}
