import { describe, expect, it } from 'vitest'

import { cloneGanttSnapshot, GanttHistoryStack } from './pm-gantt-history'

describe('GanttHistoryStack', () => {
  it('supports undo/redo round trip', () => {
    const stack = new GanttHistoryStack()
    const a = cloneGanttSnapshot([], [])
    const b = cloneGanttSnapshot([], [])
    const c = cloneGanttSnapshot([], [])

    stack.pushBeforeChange(a)
    expect(stack.canUndo).toBe(true)
    expect(stack.canRedo).toBe(false)

    const previous = stack.popUndo(b)
    expect(previous).toBe(a)
    expect(stack.canRedo).toBe(true)

    const next = stack.popRedo(c)
    expect(next).toBe(b)
    expect(stack.canUndo).toBe(true)
  })

  it('clears redo when a new change is pushed', () => {
    const stack = new GanttHistoryStack()
    const a = cloneGanttSnapshot([], [])
    const b = cloneGanttSnapshot([], [])
    const c = cloneGanttSnapshot([], [])

    stack.pushBeforeChange(a)
    stack.popUndo(b)
    expect(stack.canRedo).toBe(true)
    stack.pushBeforeChange(c)
    expect(stack.canRedo).toBe(false)
  })
})
