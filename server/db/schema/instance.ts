import { sql } from 'drizzle-orm'
import { check, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import type { SignUpPolicy } from '../../domain/sign-up'
import { DEFAULT_INSTANCE_SETTINGS } from '../../domain/instance-settings'

/** Singleton row (id = 1) holding the instance settings the Admin controls. */
export const instanceSettings = pgTable(
  'instance_settings',
  {
    id: integer('id').primaryKey().default(1),
    signUpPolicy: text('sign_up_policy')
      .$type<SignUpPolicy>()
      .default(DEFAULT_INSTANCE_SETTINGS.signUpPolicy)
      .notNull(),
    maxDocumentBytes: integer('max_document_bytes')
      .default(DEFAULT_INSTANCE_SETTINGS.maxDocumentBytes)
      .notNull(),
    maxDocumentPages: integer('max_document_pages')
      .default(DEFAULT_INSTANCE_SETTINGS.maxDocumentPages)
      .notNull(),
    maxConcurrentDocumentsPerUser: integer('max_concurrent_documents_per_user')
      .default(DEFAULT_INSTANCE_SETTINGS.maxConcurrentDocumentsPerUser)
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    check('instance_settings_singleton', sql`${t.id} = 1`),
    check('instance_settings_sign_up_policy', sql`${t.signUpPolicy} in ('open', 'invite-only')`),
    check('instance_settings_limits_positive', sql`${t.maxDocumentBytes} > 0 and ${t.maxDocumentPages} > 0`),
    check('instance_settings_concurrency_positive', sql`${t.maxConcurrentDocumentsPerUser} > 0`),
  ],
)
