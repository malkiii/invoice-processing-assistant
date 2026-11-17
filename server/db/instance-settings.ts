import { eq } from 'drizzle-orm'
import { DEFAULT_INSTANCE_SETTINGS, type InstanceSettings } from '../domain/instance-settings'
import type { Database } from './client'
import { instanceSettings } from './schema'

/** Returns the instance settings, falling back to the defaults until the Admin saves any. */
export async function getInstanceSettings(db: Database): Promise<InstanceSettings> {
  const [row] = await db
    .select({
      signUpPolicy: instanceSettings.signUpPolicy,
      maxDocumentBytes: instanceSettings.maxDocumentBytes,
      maxDocumentPages: instanceSettings.maxDocumentPages,
      maxConcurrentDocumentsPerUser: instanceSettings.maxConcurrentDocumentsPerUser,
    })
    .from(instanceSettings)
    .where(eq(instanceSettings.id, 1))
  return row ?? { ...DEFAULT_INSTANCE_SETTINGS }
}

export async function updateInstanceSettings(
  db: Database,
  changes: Partial<InstanceSettings>,
): Promise<InstanceSettings> {
  await db
    .insert(instanceSettings)
    .values({ id: 1, ...changes })
    .onConflictDoUpdate({ target: instanceSettings.id, set: changes })
  return getInstanceSettings(db)
}
