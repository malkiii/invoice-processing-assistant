import { describe, expect, it } from 'vitest'
import type { CheckResult } from '../checks'
import { checkStatusOf } from './check-results'

const pass: CheckResult = { id: 'totals_sum', status: 'pass', message: 'Totals add up', fields: ['total'] }
const fail: CheckResult = { id: 'dates', status: 'fail', message: 'Due date before issue date', fields: ['due_date'] }

describe('checkStatusOf', () => {
  it('is unchecked until Checks have run, clean when none failed, failing when any did', () => {
    expect(checkStatusOf(null)).toBe('unchecked')
    expect(checkStatusOf([pass, { ...pass, id: 'duplicate', status: 'not_applicable' }])).toBe('clean')
    expect(checkStatusOf([pass, fail])).toBe('failing')
  })
})
