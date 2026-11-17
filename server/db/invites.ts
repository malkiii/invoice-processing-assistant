import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import type { Database } from './client'
import { invite } from './schema/invites'

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface PendingInvite {
  id: string
  email: string
  expiresAt: Date
  createdAt: Date
}

const pendingColumns = {
  id: invite.id,
  email: invite.email,
  expiresAt: invite.expiresAt,
  createdAt: invite.createdAt,
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

/** Creates (or replaces) the pending invite for an email. Returns the raw link token once. */
export async function createInvite(
  db: Database,
  input: { email: string; invitedBy: string },
): Promise<{ invite: PendingInvite; token: string }> {
  const email = normalizeEmail(input.email)
  const token = randomBytes(32).toString('base64url')
  return db.transaction(async (tx) => {
    await tx.delete(invite).where(and(eq(invite.email, email), isNull(invite.acceptedAt)))
    const [row] = await tx
      .insert(invite)
      .values({
        id: randomUUID(),
        email,
        tokenHash: hashToken(token),
        invitedBy: input.invitedBy,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      })
      .returning(pendingColumns)
    return { invite: row!, token }
  })
}

export function listPendingInvites(db: Database): Promise<PendingInvite[]> {
  return db
    .select(pendingColumns)
    .from(invite)
    .where(and(isNull(invite.acceptedAt), gt(invite.expiresAt, new Date())))
    .orderBy(invite.createdAt)
}

export async function revokeInvite(db: Database, id: string) {
  await db.delete(invite).where(and(eq(invite.id, id), isNull(invite.acceptedAt)))
}

/**
 * Whether a pending, unexpired invite exists for `email`. Email sign-ups must
 * present that invite's link token; OAuth sign-ups match on the provider's
 * verified email alone.
 */
export async function hasUsableInvite(
  db: Database,
  input: { email: string; token: string | undefined; requireToken: boolean },
): Promise<boolean> {
  if (input.requireToken && !input.token) return false
  const conditions = [
    eq(invite.email, normalizeEmail(input.email)),
    isNull(invite.acceptedAt),
    gt(invite.expiresAt, new Date()),
  ]
  if (input.token) conditions.push(eq(invite.tokenHash, hashToken(input.token)))
  const [row] = await db.select({ id: invite.id }).from(invite).where(and(...conditions))
  return Boolean(row)
}

export async function markInviteAccepted(db: Database, email: string) {
  await db
    .update(invite)
    .set({ acceptedAt: new Date() })
    .where(and(eq(invite.email, normalizeEmail(email)), isNull(invite.acceptedAt)))
}
