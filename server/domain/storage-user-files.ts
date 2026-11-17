import type { ObjectStorage } from './storage'
import { userStoragePrefix } from './storage-keys'

/** Matches `UserFileStore` in server/admin/user-files.ts (structurally, to keep domain free of admin). */
export interface StorageUserFiles {
  deleteAllForUser(userId: string): Promise<void>
}

/** Deletes every stored object a User owns, by key prefix. Idempotent. */
export function createStorageUserFiles(storage: ObjectStorage): StorageUserFiles {
  return {
    deleteAllForUser: (userId) => storage.deletePrefix(userStoragePrefix(userId)),
  }
}
