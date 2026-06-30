import { describe, expect, it } from 'vitest'
import { buildGroupNotebookId } from './group-notebook.js'
import { reconcileReceivedGroupSharedNotes } from './group-note-placement.js'

describe('reconcileReceivedGroupSharedNotes', () => {
  it('moves received notes into group notebook for non-owners', () => {
    const groupNotebookId = buildGroupNotebookId('ws-1')
    const result = reconcileReceivedGroupSharedNotes({
      notebooks: [{ id: 'notebook-default', name: '默认笔记本', isDefault: true }],
      notes: [
        {
          id: 'note-1',
          notebookId: 'notebook-default',
          updatedAt: 200,
        },
      ],
      placements: [
        {
          noteId: 'note-1',
          p2pWorkspaceId: 'ws-1',
          workspaceName: '测试群',
          sharedBy: 'member-b',
        },
      ],
      selfMemberIdByWorkspace: { 'ws-1': 'member-a' },
    })

    expect(result.changed).toBe(true)
    expect(result.notes[0]?.notebookId).toBe(groupNotebookId)
    expect(result.notebooks.some((item) => item.id === groupNotebookId && item.name === '测试群')).toBe(
      true,
    )
  })

  it('keeps owner notebook unchanged', () => {
    const result = reconcileReceivedGroupSharedNotes({
      notebooks: [{ id: 'nb-owner', name: '我的工作' }],
      notes: [{ id: 'note-1', notebookId: 'nb-owner' }],
      placements: [
        {
          noteId: 'note-1',
          p2pWorkspaceId: 'ws-1',
          workspaceName: '测试群',
          sharedBy: 'member-a',
        },
      ],
      selfMemberIdByWorkspace: { 'ws-1': 'member-a' },
    })

    expect(result.changed).toBe(false)
    expect(result.notes[0]?.notebookId).toBe('nb-owner')
  })
})
