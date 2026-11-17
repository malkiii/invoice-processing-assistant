/**
 * Provider Connections (ADR 0003), per-model settings, and per-User preferences.
 * API keys are stored only as AES-256-GCM ciphertext (`server/domain/crypto`).
 */
import { sql } from 'drizzle-orm'
import { check, doublePrecision, index, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import type { ModelCapability } from '../../domain/model-capability'
import type { ProviderKind } from '../../domain/provider-presets'
import { user } from './auth'
import { template } from './templates'

export type ProviderConnectionStatus = 'ok' | 'broken'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}

export const providerConnection = pgTable(
  'provider_connection',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<ProviderKind>().notNull(),
    name: text('name').notNull(),
    /** `v1:<iv>:<tag>:<ciphertext>`; null for providers that need no key. */
    encryptedApiKey: text('encrypted_api_key'),
    /** Masked suffix shown to the User, e.g. `••••c123`. */
    apiKeyHint: text('api_key_hint'),
    /** Null means the preset's default base URL. */
    baseUrl: text('base_url'),
    defaultModel: text('default_model'),
    status: text('status').$type<ProviderConnectionStatus>().default('ok').notNull(),
    statusMessage: text('status_message'),
    ...timestamps,
  },
  (t) => [
    index('provider_connection_user_id_idx').on(t.userId),
    check('provider_connection_status', sql`${t.status} in ('ok', 'broken')`),
  ],
)

/** A User's overrides for one model of one Provider Connection: Model Capability and price. */
export const providerModelSetting = pgTable(
  'provider_model_setting',
  {
    connectionId: text('connection_id')
      .notNull()
      .references(() => providerConnection.id, { onDelete: 'cascade' }),
    modelId: text('model_id').notNull(),
    capabilityOverride: text('capability_override').$type<ModelCapability>(),
    inputPricePerMillion: doublePrecision('input_price_per_million'),
    outputPricePerMillion: doublePrecision('output_price_per_million'),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.connectionId, t.modelId] }),
    check(
      'provider_model_setting_capability',
      sql`${t.capabilityOverride} is null or ${t.capabilityOverride} in ('pdf', 'images', 'text')`,
    ),
    check(
      'provider_model_setting_prices_non_negative',
      sql`coalesce(${t.inputPricePerMillion}, 0) >= 0 and coalesce(${t.outputPricePerMillion}, 0) >= 0`,
    ),
  ],
)

export const userPreferences = pgTable(
  'user_preferences',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    defaultConnectionId: text('default_connection_id').references(() => providerConnection.id, {
      onDelete: 'set null',
    }),
    defaultModel: text('default_model'),
    /** Null means the built-in default Template. */
    defaultTemplateId: text('default_template_id').references(() => template.id, { onDelete: 'set null' }),
    theme: text('theme').$type<'noir' | 'day'>().default('noir').notNull(),
    /** Null keeps Documents forever. */
    autoDeleteAfterDays: integer('auto_delete_after_days'),
    updatedAt: timestamps.updatedAt,
  },
  (t) => [
    check('user_preferences_theme', sql`${t.theme} in ('noir', 'day')`),
    check('user_preferences_auto_delete_positive', sql`${t.autoDeleteAfterDays} is null or ${t.autoDeleteAfterDays} > 0`),
  ],
)
