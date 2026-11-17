import { describe, expect, it } from 'vitest'
import { tableGridSlot } from '../../../app/lib/cursor-effects/table-grid'

describe('tableGridSlot', () => {
  const grid = { columns: 4, rows: 2, cellWidth: 30, cellHeight: 20 }

  it('centres the table on the cursor and fills it row by row', () => {
    // 120×40 table centred on (100, 100) starts at (40, 80); slots are cell centres.
    expect(tableGridSlot(0, { x: 100, y: 100 }, grid)).toEqual({ x: 55, y: 90 })
    expect(tableGridSlot(3, { x: 100, y: 100 }, grid)).toEqual({ x: 145, y: 90 })
    expect(tableGridSlot(5, { x: 100, y: 100 }, grid)).toEqual({ x: 85, y: 110 })
  })

  it('has no slot for particles beyond the table', () => {
    expect(tableGridSlot(8, { x: 100, y: 100 }, grid)).toBeNull()
  })
})
