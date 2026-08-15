import { describe, expect, it } from 'vitest'
import { applyNotePushStamps, selectDirtyNoteChanges } from './notePushDelta'

const EMPTY = {
  cursor: null,
  noteStamps: {},
  deletedStamps: {},
  classroomStamps: {},
  knowledgeSince: 0,
}

describe('note push delta', () => {
  it('pushes only notes that changed since the last stamp', () => {
    const notes = [
      { id: 'a', notebookId: 'nb', title: 'A', body: '1', updatedAt: 10 },
      { id: 'b', notebookId: 'nb', title: 'B', body: '2', updatedAt: 20 },
    ]
    const changes = selectDirtyNoteChanges(notes, [], {
      noteStamps: { a: 10 },
      deletedStamps: {},
    })
    expect(changes.map((item) => item.entityId)).toEqual(['b'])
  })

  it('records stamps after a successful push', () => {
    const notes = [{ id: 'a', notebookId: 'nb', title: 'A', body: '1', updatedAt: 10 }]
    const pushed = selectDirtyNoteChanges(notes, [], EMPTY)
    const next = applyNotePushStamps(EMPTY, notes, [], pushed)
    expect(next.noteStamps.a).toBe(10)
    expect(selectDirtyNoteChanges(notes, [], next)).toEqual([])
  })
})
