import { and, eq } from 'drizzle-orm'
import type { Database } from './client'
import { findUsableTemplate } from '../domain/templates'
import { providerConnection, userPreferences } from './schema'

export type ThemeName = 'noir' | 'day'

/** A User's global defaults, used for every intake (spec "Providers"). */
export interface UserPreferences {
  defaultConnectionId: string | null
  defaultModel: string | null
  /** Null until the User picks one; null means the built-in default Template. */
  defaultTemplateId: string | null
  theme: ThemeName
  /** Null keeps Documents forever. */
  autoDeleteAfterDays: number | null
}

export class UserPreferencesInputError extends Error {}

const DEFAULTS: UserPreferences = {
  defaultConnectionId: null,
  defaultModel: null,
  defaultTemplateId: null,
  theme: 'noir',
  autoDeleteAfterDays: null,
}

const columns = {
  defaultConnectionId: userPreferences.defaultConnectionId,
  defaultModel: userPreferences.defaultModel,
  defaultTemplateId: userPreferences.defaultTemplateId,
  theme: userPreferences.theme,
  autoDeleteAfterDays: userPreferences.autoDeleteAfterDays,
}

export async function getUserPreferences(db: Database, userId: string): Promise<UserPreferences> {
  const [row] = await db.select(columns).from(userPreferences).where(eq(userPreferences.userId, userId))
  return row ?? { ...DEFAULTS }
}

export async function updateUserPreferences(
  db: Database,
  userId: string,
  changes: Partial<UserPreferences>,
): Promise<UserPreferences> {
  if (changes.defaultConnectionId) {
    const [owned] = await db
      .select({ id: providerConnection.id })
      .from(providerConnection)
      .where(and(eq(providerConnection.id, changes.defaultConnectionId), eq(providerConnection.userId, userId)))
    if (!owned) throw new UserPreferencesInputError('Unknown Provider Connection')
  }
  if (changes.defaultTemplateId && !(await findUsableTemplate(db, userId, changes.defaultTemplateId))) {
    throw new UserPreferencesInputError('Unknown Template')
  }
  if (changes.autoDeleteAfterDays != null && !(Number.isInteger(changes.autoDeleteAfterDays) && changes.autoDeleteAfterDays > 0)) {
    throw new UserPreferencesInputError('Auto-delete must be a whole number of days, at least 1')
  }
  if (changes.theme !== undefined && changes.theme !== 'noir' && changes.theme !== 'day') {
    throw new UserPreferencesInputError('Unknown theme')
  }
  await db
    .insert(userPreferences)
    .values({ userId, ...changes })
    .onConflictDoUpdate({ target: userPreferences.userId, set: { ...changes, updatedAt: new Date() } })
  return getUserPreferences(db, userId)
}
