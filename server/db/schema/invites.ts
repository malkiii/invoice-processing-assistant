import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { user } from './auth'

/**
 * An Admin's invitation for one email address to sign up while the sign-up
 * policy is invite-only. Only the SHA-256 hash of the link token is stored.
 */
export const invite = pgTable(
  'invite',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    invitedBy: text('invited_by').references(() => user.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  // At most one pending invite per email; re-inviting replaces it.
  (t) => [uniqueIndex('invite_pending_email_idx').on(t.email).where(sql`${t.acceptedAt} is null`)],
)
