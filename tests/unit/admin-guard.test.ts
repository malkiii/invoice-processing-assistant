import { describe, expect, it } from 'vitest'
import { isAdminApiPath } from '../../server/admin/guard'

describe('isAdminApiPath', () => {
  it.each([
    '/api/admin',
    '/api/admin/',
    '/api/admin/users',
    '/api/admin/users/abc?x=1',
    '/API/Admin/users',
    '//api//admin/users',
    '/api/./admin/users',
    '/api/x/../admin/users',
    '/api/%61dmin/users',
    '/api%2Fadmin/users',
  ])('guards %s', (path) => {
    expect(isAdminApiPath(path)).toBe(true)
  })

  it.each(['/api/health', '/api/administrator', '/api/auth/admin/list-users', '/admin', '/api'])(
    'leaves %s alone',
    (path) => {
      expect(isAdminApiPath(path)).toBe(false)
    },
  )
})
