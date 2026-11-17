import { describe, expect, it } from 'vitest'
import { parseSettingsUpdate } from '../../server/admin/settings-input'

describe('parseSettingsUpdate', () => {
  it('accepts a partial update', () => {
    expect(parseSettingsUpdate({ signUpPolicy: 'invite-only', maxConcurrentDocumentsPerUser: 3 })).toEqual({
      success: true,
      data: { signUpPolicy: 'invite-only', maxConcurrentDocumentsPerUser: 3 },
    })
  })

  it.each([
    [{ signUpPolicy: 'closed' }],
    [{ maxDocumentBytes: 0 }],
    [{ maxDocumentBytes: 2 ** 31 }],
    [{ maxDocumentPages: 1.5 }],
    [{ maxConcurrentDocumentsPerUser: -1 }],
    [{ role: 'admin' }],
  ])('rejects %j', (input) => {
    expect(parseSettingsUpdate(input).success).toBe(false)
  })
})
