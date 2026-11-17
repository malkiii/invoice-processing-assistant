export type SignUpPolicy = 'open' | 'invite-only'
export type UserRole = 'admin' | 'user'

export type SignUpDecision =
  | { allowed: true; role: UserRole }
  | { allowed: false; reason: string }

/**
 * Decides whether a new User may sign up, and with which role.
 * The first User of an instance always becomes the Admin, whatever the policy.
 */
export function decideSignUp(input: {
  existingUserCount: number
  policy: SignUpPolicy
}): SignUpDecision {
  if (input.existingUserCount === 0) return { allowed: true, role: 'admin' }
  if (input.policy === 'invite-only') {
    return { allowed: false, reason: 'Sign-up is invite-only on this instance.' }
  }
  return { allowed: true, role: 'user' }
}
