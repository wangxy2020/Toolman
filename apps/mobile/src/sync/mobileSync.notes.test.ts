import { describe, expect, it } from 'vitest'
import { mergeNotesFromSyncChanges } from './noteSyncMerge'

describe('mergeNotesFromSyncChanges', () => {
  it('does not resurrect a locally deleted note from an older upsert', () => {
    const merged = mergeNotesFromSyncChanges(
      [],
      [{ id: 'note-1', deletedAt: 200 }],
      [
        {
          entityKind: 'note',
          entityId: 'note-1',
          op: 'upsert',
          updatedAt: 100,
          payload: { title: '你是什么大模型', body: '...' },
        },
      ],
    )
    expect(merged.notes).toEqual([])
    expect(merged.deletedNotes).toEqual([{ id: 'note-1', deletedAt: 200 }])
  })

  it('applies a remote delete over a local note', () => {
    const merged = mergeNotesFromSyncChanges(
      [{ id: 'note-1', notebookId: 'notebook-default', title: '旧', body: '', updatedAt: 50 }],
      [],
      [
        {
          entityKind: 'note',
          entityId: 'note-1',
          op: 'delete',
          updatedAt: 80,
          payload: {},
        },
      ],
    )
    expect(merged.notes).toEqual([])
    expect(merged.deletedNotes).toEqual([{ id: 'note-1', deletedAt: 80 }])
  })

  it('lets a newer remote upsert revive a note after delete', () => {
    const merged = mergeNotesFromSyncChanges(
      [],
      [{ id: 'note-1', deletedAt: 80 }],
      [
        {
          entityKind: 'note',
          entityId: 'note-1',
          op: 'upsert',
          updatedAt: 120,
          payload: { title: '新内容', body: 'revived' },
        },
      ],
    )
    expect(merged.notes).toEqual([
      {
        id: 'note-1',
        notebookId: 'notebook-default',
        title: '新内容',
        body: 'revived',
        updatedAt: 120,
      },
    ])
    expect(merged.deletedNotes).toEqual([])
  })
})
