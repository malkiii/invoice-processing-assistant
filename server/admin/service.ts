/**
 * Instance administration (spec "Users and access"). Framework-free so it can
 * be integration-tested; Nitro routes under `server/api/admin` call it after
 * the Admin guard.
 *
 * It must never read or return Documents, Invoices or Provider Connection data,
 * so it imports only the auth, instance and invite tables (enforced by
 * tests/unit/admin-boundary.test.ts).
 */
import { eq, sql } from 'drizzle-orm'
import type { Database } from '../db/client'
import { getInstanceSettings, updateInstanceSettings } from '../db/instance-settings'
import {
  createInvite,
  listPendingInvites,
  normalizeEmail,
  revokeInvite,
  type PendingInvite,
} from '../db/invites'
import { session, user } from '../db/schema/auth'
import type { InstanceSettings } from '../domain/instance-settings'
import type { UserRole } from '../domain/sign-up'
import { checkSystemHealth } from './health'
import type { UserFileStore } from './user-files'
import { APP_NAME } from '../lib/auth'
import type { Mailer } from '../lib/mailer'

export class AdminError extends Error {
  constructor(
    readonly statusCode: 400 | 404 | 409,
    message: string,
  ) {
    super(message)
  }
}

export interface AdminServiceDeps {
  db: Database
  mailer: Mailer | null
  /** Public base URL of the app, used to build invite links. */
  appUrl: string
  userFiles: UserFileStore
  /** Throws when object storage is unreachable; omitted until storage is wired. */
  checkStorage?: () => Promise<void>
}

/** What the Admin sees of a User: account fields only, never their data. */
export interface AdminUserView {
  id: string
  name: string
  email: string
  role: UserRole
  emailVerified: boolean
  disabled: boolean
  twoFactorEnabled: boolean
  createdAt: Date
}

export function createAdminService(deps: AdminServiceDeps) {
  const { db, mailer, appUrl, userFiles } = deps

  async function requireOtherUser(userId: string, actorId: string, action: string) {
    if (userId === actorId) throw new AdminError(400, `You cannot ${action} yourself.`)
    const [target] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId))
    if (!target) throw new AdminError(404, 'User not found.')
  }

  return {
    listUsers: (): Promise<AdminUserView[]> =>
      db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          emailVerified: user.emailVerified,
          disabled: sql<boolean>`coalesce(${user.banned}, false)`,
          twoFactorEnabled: sql<boolean>`coalesce(${user.twoFactorEnabled}, false)`,
          createdAt: user.createdAt,
        })
        .from(user)
        .orderBy(user.createdAt),

    /** Disables a User: ends their sessions and blocks sign-in (Better Auth admin plugin's ban). */
    async disableUser(input: { userId: string; actorId: string }) {
      await requireOtherUser(input.userId, input.actorId, 'disable')
      await db.transaction(async (tx) => {
        await tx
          .update(user)
          .set({ banned: true, banReason: 'Disabled by the Admin', banExpires: null })
          .where(eq(user.id, input.userId))
        await tx.delete(session).where(eq(session.userId, input.userId))
      })
    },

    async enableUser(userId: string) {
      await db.update(user).set({ banned: false, banReason: null, banExpires: null }).where(eq(user.id, userId))
    },

    /**
     * Deletes a User with all of their data and files. Files go first: if storage
     * fails, the User stays so the deletion can be retried. Rows then cascade
     * from `user` through every table's `ON DELETE CASCADE` foreign key.
     */
    async deleteUser(input: { userId: string; actorId: string }) {
      await requireOtherUser(input.userId, input.actorId, 'delete')
      await userFiles.deleteAllForUser(input.userId)
      await db.delete(user).where(eq(user.id, input.userId))
    },

    getHealth: () => checkSystemHealth({ db, checkStorage: deps.checkStorage ?? null }),

    getSettings: (): Promise<InstanceSettings> => getInstanceSettings(db),

    updateSettings: (changes: Partial<InstanceSettings>): Promise<InstanceSettings> =>
      updateInstanceSettings(db, changes),

    listInvites: (): Promise<PendingInvite[]> => listPendingInvites(db),

    revokeInvite: (id: string) => revokeInvite(db, id),

    /** Creates an invite link and emails it when SMTP is configured. */
    async inviteUser(input: { email: string; invitedBy: string }) {
      const email = normalizeEmail(input.email)
      const existing = await db.$count(user, eq(user.email, email))
      if (existing > 0) throw new AdminError(409, `${email} already has an account.`)

      const { invite, token } = await createInvite(db, { email, invitedBy: input.invitedBy })
      const url = new URL('/auth/sign-up', appUrl)
      url.searchParams.set('invite', token)
      url.searchParams.set('email', email)
      const link = url.toString()

      if (mailer) {
        await mailer.send({
          to: email,
          subject: `You're invited to ${APP_NAME}`,
          text: `You've been invited to ${APP_NAME}. Create your account: ${link}`,
        })
      }
      return { invite, link, emailed: Boolean(mailer) }
    },
  }
}

export type AdminService = ReturnType<typeof createAdminService>
