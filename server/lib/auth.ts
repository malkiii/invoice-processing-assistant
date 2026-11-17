import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { admin, twoFactor } from 'better-auth/plugins'
import type { Database } from '../db/client'
import { getInstanceSettings } from '../db/instance-settings'
import * as schema from '../db/schema'
import { decideSignUp } from '../domain/sign-up'
import type { AppConfig } from './config'
import type { Mailer } from './mailer'

export const APP_NAME = 'Invoice Processing Assistant'

/**
 * Builds the Better Auth instance. Framework-free so it can be exercised in
 * integration tests; the Nitro handler gets its singleton from `useAuth()`.
 */
export function createAuth(deps: { db: Database; config: AppConfig; mailer: Mailer | null }) {
  const { db, config, mailer } = deps

  return betterAuth({
    appName: APP_NAME,
    baseURL: config.authUrl,
    secret: config.authSecret,
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: config.requireEmailVerification,
      sendResetPassword: mailer
        ? async ({ user, url }) => {
            await mailer.send({
              to: user.email,
              subject: 'Reset your password',
              text: `Reset your ${APP_NAME} password: ${url}`,
            })
          }
        : undefined,
    },
    emailVerification: mailer
      ? {
          sendOnSignUp: true,
          autoSignInAfterVerification: true,
          sendVerificationEmail: async ({ user, url }) => {
            await mailer.send({
              to: user.email,
              subject: 'Verify your email',
              text: `Confirm your ${APP_NAME} account: ${url}`,
            })
          },
        }
      : undefined,
    socialProviders: config.oauth,
    plugins: [admin({ defaultRole: 'user', adminRoles: ['admin'] }), twoFactor({ issuer: APP_NAME })],
    databaseHooks: {
      user: {
        create: {
          // Enforces the sign-up policy for every sign-up path (email and OAuth)
          // and makes the first User the Admin.
          before: async (user) => {
            const existingUserCount = await db.$count(schema.user)
            const { signUpPolicy } = await getInstanceSettings(db)
            const decision = decideSignUp({ existingUserCount, policy: signUpPolicy })
            if (!decision.allowed) throw new APIError('FORBIDDEN', { message: decision.reason })
            return { data: { ...user, role: decision.role } }
          },
        },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
