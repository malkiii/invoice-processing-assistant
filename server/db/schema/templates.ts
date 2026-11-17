/** Templates: the Fields to extract. The built-in default row has no owner and is read-only. */
import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import type { Field } from '../../domain/template/fields'
import { user } from './auth'

export const template = pgTable(
  'template',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Null for the built-in default Template, which every User can read and clone. */
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    fields: jsonb('fields').$type<Field[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('template_user_id_idx').on(t.userId)],
)
