import { describe, expect, it } from 'vitest'

import { DEFAULT_COST_COLUMN_VISIBILITY } from './pm-cost-column-prefs'
import {
  costTableVariableWindowRange,
  costTableWindowRange,
  countCostTableColumns,
} from './pm-cost-table-window'

describe('costTableWindowRange', () => {
  it('windows a long catalog around the current scroll offset', () => {
    const range = costTableWindowRange({
      scrollTop: 3600,
      viewportHeight: 360,
      rowCount: 1475,
      rowHeight: 36,
      overscan: 8,
    })
    expect(range.start).toBe(92)
    expect(range.end).toBe(119)
    expect(range.topPad).toBe(92 * 36)
    expect(range.bottomPad).toBe((1475 - 119) * 36)
  })

  it('falls back to the start when scroll sits past a shorter filtered list', () => {
    const range = costTableWindowRange({
      scrollTop: 20000,
      viewportHeight: 360,
      rowCount: 20,
      rowHeight: 36,
      overscan: 8,
    })
    expect(range.start).toBe(0)
    expect(range.end).toBe(20)
    expect(range.topPad).toBe(0)
    expect(range.bottomPad).toBe(0)
  })

  it('clamps an empty catalog', () => {
    expect(
      costTableWindowRange({
        scrollTop: 0,
        viewportHeight: 400,
        rowCount: 0,
      }),
    ).toEqual({ start: 0, end: 0, topPad: 0, bottomPad: 0 })
  })
})

describe('costTableVariableWindowRange', () => {
  it('pads using per-row heights so wrapped names stay aligned', () => {
    const heights = [36, 72, 36, 54, 36]
    const range = costTableVariableWindowRange({
      scrollTop: 108,
      viewportHeight: 80,
      heights,
      overscan: 1,
    })
    expect(range.start).toBeLessThanOrEqual(2)
    expect(range.end).toBeGreaterThan(2)
    expect(range.topPad).toBeGreaterThanOrEqual(0)
    expect(range.topPad + range.bottomPad).toBeLessThan(
      heights.reduce((sum, height) => sum + height, 0),
    )
  })
})

describe('countCostTableColumns', () => {
  it('counts index, spacer, and every visible data column', () => {
    expect(countCostTableColumns(DEFAULT_COST_COLUMN_VISIBILITY)).toBe(14)
    expect(
      countCostTableColumns({
        ...DEFAULT_COST_COLUMN_VISIBILITY,
        note: false,
        baseline: false,
      }),
    ).toBe(12)
    expect(
      countCostTableColumns(DEFAULT_COST_COLUMN_VISIBILITY, { showMeteringColumns: true }),
    ).toBe(20)
    expect(
      countCostTableColumns(DEFAULT_COST_COLUMN_VISIBILITY, { ipcColumnCount: 3 }),
    ).toBe(19)
  })
})
