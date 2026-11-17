/** Extractions of a Document and the Invoices each one found. */
import { sql } from 'drizzle-orm'
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type { ProviderKind } from '../../domain/provider-presets'
import type { InvoiceValues } from '../../domain/template/fields'
import type { TemplateSnapshot } from '../../domain/template/snapshot'
import { user } from './auth'
import { document } from './documents'
import { providerConnection } from './providers'
import { template } from './templates'

export const extraction = pgTable(
  'extraction',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => document.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Exactly one Extraction per Document is the Current Extraction (enforced by a partial unique index). */
    isCurrent: boolean('is_current').default(false).notNull(),
    /** Kept when the Provider Connection is deleted; `providerKind` and `modelId` still tell what ran. */
    connectionId: text('connection_id').references(() => providerConnection.id, { onDelete: 'set null' }),
    providerKind: text('provider_kind').$type<ProviderKind>().notNull(),
    modelId: text('model_id').notNull(),
    /** The Template it ran with, if it still exists; the snapshot is what Invoices render from (ADR 0006). */
    templateId: text('template_id').references(() => template.id, { onDelete: 'set null' }),
    templateSnapshot: jsonb('template_snapshot').$type<TemplateSnapshot>().notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    durationMs: integer('duration_ms').notNull(),
    /** In the User's price currency; null when the model has no price set. */
    estimatedCost: doublePrecision('estimated_cost'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('extraction_document_id_idx').on(t.documentId, t.createdAt),
    index('extraction_user_id_idx').on(t.userId, t.createdAt),
    uniqueIndex('extraction_one_current_per_document').on(t.documentId).where(sql`${t.isCurrent}`),
  ],
)

export const invoice = pgTable(
  'invoice',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    extractionId: uuid('extraction_id')
      .notNull()
      .references(() => extraction.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => document.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Order within the Document, from 0. */
    position: integer('position').notNull(),
    /** Exactly as the Extraction produced them. Never edited. */
    rawValues: jsonb('raw_values').$type<InvoiceValues>().notNull(),
    /** The User's edits, overlaid on Raw Values (Review, issue 06). */
    correctedValues: jsonb('corrected_values').$type<InvoiceValues>().default({}).notNull(),
    /** Results of the last Checks run (issue 07); null until Checks have run. */
    checkResults: jsonb('check_results').$type<unknown>(),
    /** Set by "Mark as reviewed"; null means unreviewed. */
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('invoice_extraction_id_idx').on(t.extractionId, t.position),
    index('invoice_user_id_idx').on(t.userId, t.createdAt),
    index('invoice_document_id_idx').on(t.documentId),
  ],
)
