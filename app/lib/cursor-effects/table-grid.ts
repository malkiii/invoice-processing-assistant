export interface Point {
  x: number
  y: number
}

export interface TableGrid {
  columns: number
  rows: number
  cellWidth: number
  cellHeight: number
}

/**
 * Where particle `index` sits when the drifting glyphs snap into a table centred on the cursor.
 * Slots fill row by row; returns null for particles that do not fit in the table.
 */
export function tableGridSlot(index: number, cursor: Point, grid: TableGrid): Point | null {
  if (index < 0 || index >= grid.columns * grid.rows) return null
  const column = index % grid.columns
  const row = Math.floor(index / grid.columns)
  const left = cursor.x - (grid.columns * grid.cellWidth) / 2
  const top = cursor.y - (grid.rows * grid.cellHeight) / 2
  return {
    x: left + (column + 0.5) * grid.cellWidth,
    y: top + (row + 0.5) * grid.cellHeight,
  }
}
