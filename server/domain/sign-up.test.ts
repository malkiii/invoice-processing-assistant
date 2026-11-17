import { describe, expect, it } from 'vitest'
import { decideSignUp } from './sign-up'

describe('decideSignUp', () => {
  it('makes the first User an Admin, even when the policy is invite-only', () => {
    expect(decideSignUp({ existingUserCount: 0, policy: 'invite-only' })).toEqual({
      allowed: true,
      role: 'admin',
    })
  })

  it('lets later Users sign up as regular users when the policy is open', () => {
    expect(decideSignUp({ existingUserCount: 3, policy: 'open' })).toEqual({
      allowed: true,
      role: 'user',
    })
  })

  it('blocks later sign-ups when the policy is invite-only', () => {
    expect(decideSignUp({ existingUserCount: 1, policy: 'invite-only' })).toEqual({
      allowed: false,
      reason: 'Sign-up is invite-only on this instance.',
    })
  })
})
