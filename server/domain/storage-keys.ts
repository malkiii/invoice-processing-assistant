/**
 * Object key layout: everything a User owns lives under `users/<userId>/`, so it can be
 * deleted by prefix when the User is deleted.
 */
export function userStoragePrefix(userId: string): string {
  return `users/${userId}/`
}

export function storageKeyFor(userId: string, documentId: string): string {
  return `${userStoragePrefix(userId)}documents/${documentId}`
}

export function exportStorageKey(userId: string, exportId: string): string {
  return `${userStoragePrefix(userId)}exports/${exportId}`
}
