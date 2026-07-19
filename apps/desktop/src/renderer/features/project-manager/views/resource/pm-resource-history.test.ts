import { describe, expect, it } from 'vitest'

import type { PmResourceRow } from './pm-resource-catalog'
import { cloneResourceRows, ResourceHistoryStack } from './pm-resource-history'

function row(partial: Partial<PmResourceRow> & Pick<PmResourceRow, 'id' | 'name'>): PmResourceRow {
  const unit = partial.unit ?? '人'
  return {
    id: partial.id,
    type: partial.type ?? 'labor',
    name: partial.name,
    spec: partial.spec ?? '',
    unit,
    pricingUnit: partial.pricingUnit ?? (unit === '人' ? '工日' : unit),
    unitPrice: partial.unitPrice ?? 100,
    applicable: partial.applicable ?? 'all',
    note: partial.note ?? '',
    sortOrder: partial.sortOrder ?? 0,
    parentId: partial.parentId ?? null,
  }
}

describe('ResourceHistoryStack', () => {
  it('supports undo/redo round trip', () => {
    const stack = new ResourceHistoryStack()
    const a = [row({ id: '1', name: 'A' })]
    const b = [row({ id: '1', name: 'B' })]
    const c = [row({ id: '1', name: 'C' })]

    stack.pushBeforeChange(cloneResourceRows(a))
    let current = b
    const previous = stack.popUndo(cloneResourceRows(current))
    expect(previous).toEqual(a)
    current = previous!
    expect(stack.canRedo).toBe(true)

    const next = stack.popRedo(cloneResourceRows(current))
    expect(next).toEqual(b)
    current = next!

    stack.pushBeforeChange(cloneResourceRows(current))
    current = c
    expect(stack.canRedo).toBe(false)
    expect(stack.popUndo(cloneResourceRows(current))).toEqual(b)
  })

  it('coalesces rapid pushes into one undo step', () => {
    const stack = new ResourceHistoryStack()
    const a = [row({ id: '1', name: 'A' })]
    const b = [row({ id: '1', name: 'B' })]
    const c = [row({ id: '1', name: 'C' })]

    stack.pushBeforeChange(cloneResourceRows(a), { coalesceMs: 500 })
    stack.pushBeforeChange(cloneResourceRows(b), { coalesceMs: 500 })
    const undone = stack.popUndo(cloneResourceRows(c))
    expect(undone).toEqual(a)
  })
})
