import { describe, expect, it } from 'vitest'
import { checkStatusOf, readCheckResults } from './check-results'

const pass = { id: 'totals', status: 'pass', message: 'Totals add up', fields: ['total'] }
const fail = { id: 'dates', status: 'fail', message: 'Due date before issue date', fields: ['issue_date', 'due_date'] }

describe('check results', () => {
  it('is unchecked until Checks have run', () => {
    expect(readCheckResults(null)).toBeNull()
    expect(checkStatusOf(null)).toBe('unchecked')
  })

  it('is clean when no Check failed, failing when any did', () => {
    expect(checkStatusOf(readCheckResults([pass, { ...pass, id: 'dup', status: 'not_applicable' }]))).toBe('clean')
    expect(checkStatusOf(readCheckResults([pass, fail]))).toBe('failing')
  })

  it('drops entries that do not match the contract', () => {
    expect(readCheckResults([pass, { id: 1 }, 'x', { ...fail, fields: 'issue_date' }])).toEqual([pass])
    expect(readCheckResults({ not: 'an array' })).toBeNull()
  })
})
