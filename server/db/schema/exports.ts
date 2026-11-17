/** Exports: one row per requested download, listed in the downloads history drawer. */
import { sql } from 'drizzle-orm'
import { bigint, boolean, check, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import type { ExportScope, ExportStatus } from '../../domain/export/exports'
import type { CsvLayout, ExportFormat } from '../../domain/export/render'
import { user } from './auth'

export const exportFile = pgTable(
  'export',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    format: text('format').$type<ExportFormat>().notNull(),
    /** Only for CSV. */
    csvLayout: text('csv_layout').$type<CsvLayout>(),
    /** Which Invoices, resolved again when the file is generated. */
    scope: jsonb('scope').$type<ExportScope>().notNull(),
    reviewedOnly: boolean('reviewed_only').default(false).notNull(),
    status: text('status').$type<ExportStatus>().notNull(),
    /** Invoices in scope when requested; updated to the exported count once generated. */
    invoiceCount: integer('invoice_count').notNull(),
    /** Download name, e.g. `invoices-2026-11-17-1430.csv`. Set once generated. */
    fileName: text('file_name'),
    /** Object key in storage, under the User's prefix. Set once generated. */
    storageKey: text('storage_key'),
    contentType: text('content_type'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    /** Human-readable reason, set when status is `failed`. */
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('export_user_id_created_at_idx').on(t.userId, t.createdAt),
    check('export_status', sql`${t.status} in ('pending', 'ready', 'failed')`),
    check('export_format', sql`${t.format} in ('csv', 'xlsx', 'json')`),
  ],
)
