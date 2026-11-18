/**
 * Source Connections (ticket 12): a User's authorised link to Google Drive or Dropbox, used to
 * pull Documents. Separate from the accounts a User signs in with. Tokens are stored only as
 * AES-256-GCM ciphertext, like Provider Connection keys (ADR 0003).
 */
import { sql } from 'drizzle-orm'
import { check, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'
import type { SourceKind } from '../../domain/source-providers'
import { user } from './auth'

export type SourceConnectionStatus = 'ok' | 'broken'

export const sourceConnection = pgTable(
  'source_connection',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<SourceKind>().notNull(),
    /** The connected account as shown to the User, e.g. its email address. */
    accountLabel: text('account_label').notNull(),
    /** `v1:<iv>:<tag>:<ciphertext>` */
    encryptedAccessToken: text('encrypted_access_token').notNull(),
    encryptedRefreshToken: text('encrypted_refresh_token'),
    /** Null when the access token does not expire. */
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    status: text('status').$type<SourceConnectionStatus>().default('ok').notNull(),
    statusMessage: text('status_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    // One connection per provider per User; connecting again replaces it.
    unique('source_connection_user_kind').on(t.userId, t.kind),
    check('source_connection_kind', sql`${t.kind} in ('google-drive', 'dropbox')`),
    check('source_connection_status', sql`${t.status} in ('ok', 'broken')`),
  ],
)
