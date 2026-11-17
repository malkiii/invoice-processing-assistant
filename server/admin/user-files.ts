/**
 * Seam between User deletion and object storage (ADR 0002). Deleting a User
 * removes their stored files through this port first, then their rows (which
 * cascade through `ON DELETE CASCADE`). Storage plugs in an implementation that
 * deletes every object the User owns; until then the no-op is used.
 */
export interface UserFileStore {
  /** Deletes every stored object owned by the User. Must be idempotent. */
  deleteAllForUser(userId: string): Promise<void>
}

export const noUserFiles: UserFileStore = {
  async deleteAllForUser() {},
}
