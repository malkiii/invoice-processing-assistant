import type { H3Event } from 'h3'
import { AdminError, createAdminService, type AdminService } from '../admin/service'
import { noUserFiles } from '../admin/user-files'
import { createSmtpMailer } from '../lib/mailer'

let adminService: AdminService | undefined

/**
 * The admin service singleton. Storage plugs into `userFiles` and
 * `checkStorage` once it exists (ticket 04).
 */
export function useAdminService(): AdminService {
  if (!adminService) {
    const config = useServerConfig()
    adminService = createAdminService({
      db: useDb(),
      mailer: config.smtp ? createSmtpMailer(config.smtp) : null,
      appUrl: config.authUrl,
      userFiles: noUserFiles,
    })
  }
  return adminService
}

type AdminSession = Awaited<ReturnType<typeof requireAdmin>>

/**
 * Defines an `/api/admin` route: requires the Admin (on top of the admin
 * middleware) and maps `AdminError`s to HTTP errors.
 */
export function defineAdminHandler<T>(
  handler: (event: H3Event, ctx: { session: AdminSession; admin: AdminService }) => Promise<T>,
) {
  return defineEventHandler(async (event) => {
    const session: AdminSession = event.context.adminSession ?? (await requireAdmin(event))
    try {
      return await handler(event, { session, admin: useAdminService() })
    } catch (error) {
      if (error instanceof AdminError) {
        throw createError({ statusCode: error.statusCode, statusMessage: error.message })
      }
      throw error
    }
  })
}
