import { z } from 'zod'

const body = z.object({ email: z.email() })

// Returns the invite link too, so the Admin can share it when SMTP is not configured.
export default defineAdminHandler(async (event, { admin, session }) => {
  const parsed = body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'A valid email is required.' })
  return admin.inviteUser({ email: parsed.data.email, invitedBy: session.user.id })
})
