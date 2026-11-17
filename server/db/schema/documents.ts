/** Intake tables: Batches and their Documents. */
import { sql } from 'drizzle-orm'
import { bigint, check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import type { DocumentFormat } from '../../domain/document-inspection'
import type { DocumentSource, DocumentStatus } from '../../domain/documents'
import { user } from './auth'

export const batch = pgTable(
  'batch',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    source: text('source').$type<DocumentSource>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('batch_user_id_created_at_idx').on(t.userId, t.createdAt)],
)

export const document = pgTable(
  'document',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => batch.id, { onDelete: 'cascade' }),
    source: text('source').$type<DocumentSource>().notNull(),
    /** The name the User knows the file by; for folder uploads, its path inside the folder. */
    name: text('name').notNull(),
    /** Object key in S3-compatible storage (ADR 0002). Null once the file is removed. */
    storageKey: text('storage_key'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    /** Detected by content sniffing once the file is confirmed. */
    format: text('format').$type<DocumentFormat>(),
    mimeType: text('mime_type'),
    pageCount: integer('page_count'),
    status: text('status').$type<DocumentStatus>().notNull(),
    /** Human-readable reason, set when status is `failed`. */
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('document_user_id_created_at_idx').on(t.userId, t.createdAt),
    index('document_batch_id_idx').on(t.batchId),
    check(
      'document_status',
      sql`${t.status} in ('uploading', 'queued', 'processing', 'extracted', 'failed')`,
    ),
  ],
)
