import { describe, expect, it } from 'vitest'
import { projectShareableWorkspaceEvent } from './share-projection.js'

function event(partial: {
  resourceType: string
  resourceId?: string
  eventType: string
  payload: Record<string, unknown>
  timestamp?: number
}) {
  return {
    resourceType: partial.resourceType,
    resourceId: partial.resourceId ?? 'res-1',
    eventType: partial.eventType,
    payloadJson: JSON.stringify(partial.payload),
    timestamp: partial.timestamp ?? 1_700_000_000_000,
  }
}

describe('projectShareableWorkspaceEvent', () => {
  it('ignores group chat and personal-looking payloads that are not shareable types', () => {
    expect(
      projectShareableWorkspaceEvent(
        event({
          resourceType: 'GroupChat',
          eventType: 'Updated',
          payload: { kind: 'group.chat.message' },
        }),
      ),
    ).toEqual([])
    expect(
      projectShareableWorkspaceEvent(
        event({
          resourceType: 'File',
          eventType: 'Shared',
          payload: { name: 'secret.pdf' },
        }),
      ),
    ).toEqual([])
  })

  it('projects knowledge share, document update, and kb delete', () => {
    expect(
      projectShareableWorkspaceEvent(
        event({
          resourceType: 'Knowledge',
          eventType: 'Shared',
          payload: { kb_id: 'kb-1', name: '手册', description: '对外' },
        }),
      ),
    ).toMatchObject([
      { action: 'upsert', item: { id: 'kb-1', name: '手册', kind: 'knowledge' } },
    ])

    const updated = projectShareableWorkspaceEvent(
      event({
        resourceType: 'Knowledge',
        resourceId: 'doc-1',
        eventType: 'Updated',
        payload: {
          kb_id: 'kb-1',
          doc_id: 'doc-1',
          title: '安装',
          content_hash: 'abc',
          mime_type: 'text/markdown',
          size_bytes: 12,
        },
      }),
    )
    expect(updated).toMatchObject([
      {
        action: 'upsert',
        item: { id: 'doc-1', parentId: 'kb-1', contentHash: 'abc' },
        knowledgeBlob: { contentHash: 'abc', sizeBytes: 12 },
      },
    ])

    expect(
      projectShareableWorkspaceEvent(
        event({
          resourceType: 'Knowledge',
          eventType: 'Deleted',
          payload: { kb_id: 'kb-1' },
        }),
      ),
    ).toEqual([{ action: 'remove', kind: 'knowledge', id: 'kb-1', cascadeChildren: true }])
  })

  it('projects note share plus Loro/content update and delete', () => {
    expect(
      projectShareableWorkspaceEvent(
        event({
          resourceType: 'Note',
          eventType: 'Shared',
          payload: {
            note_id: 'note-1',
            title: '纪要',
            notebook_id: 'nb-1',
            notebook_name: '工作',
            permission: 'write',
          },
        }),
      ),
    ).toMatchObject([
      {
        action: 'upsert',
        item: { id: 'note-1', name: '纪要', kind: 'notes', permission: 'write' },
      },
    ])

    const updated = projectShareableWorkspaceEvent(
      event({
        resourceType: 'Note',
        eventType: 'Updated',
        payload: {
          note_id: 'note-1',
          title: '纪要',
          content: 'hello',
          loro_oplog: 'AQID',
        },
      }),
    )
    expect(updated).toMatchObject([
      {
        action: 'upsert',
        noteBody: { noteId: 'note-1', content: 'hello', loroOplog: 'AQID' },
      },
    ])

    expect(
      projectShareableWorkspaceEvent(
        event({
          resourceType: 'Note',
          eventType: 'Deleted',
          payload: { note_id: 'note-1' },
        }),
      ),
    ).toEqual([{ action: 'remove', kind: 'notes', id: 'note-1', cascadeChildren: false }])

    const permissionOnly = projectShareableWorkspaceEvent(
      event({
        resourceType: 'Note',
        eventType: 'Updated',
        payload: { note_id: 'note-1', permission: 'read' },
      }),
    )
    expect(permissionOnly[0]).toMatchObject({
      action: 'upsert',
      noteBody: { noteId: 'note-1', permission: 'read' },
    })
    expect(permissionOnly[0] && permissionOnly[0].action === 'upsert' ? permissionOnly[0].noteBody : null)
      .not.toHaveProperty('content')
  })

  it('projects agent and workflow shares', () => {
    expect(
      projectShareableWorkspaceEvent(
        event({
          resourceType: 'Agent',
          eventType: 'Shared',
          payload: { assistant_id: 'ag-1', name: '助手' },
        }),
      ),
    ).toMatchObject([{ action: 'upsert', item: { id: 'ag-1', kind: 'agents', name: '助手' } }])

    const withTopics = projectShareableWorkspaceEvent({
      resourceType: 'Agent',
      resourceId: 'ag-1',
      eventType: 'Shared',
      payloadJson: JSON.stringify({
        assistant_id: 'ag-1',
        name: '助手',
        session_ids: ['sess-1', 'sess-2'],
        session_titles: { 'sess-1': '问候', 'sess-2': '规划' },
        session_permissions: { 'sess-1': 'callable', 'sess-2': 'read' },
      }),
      timestamp: 1_700_000_000_000,
      operatorId: 'member-a',
      sourceDeviceId: 'desk-a',
    })
    expect(withTopics).toMatchObject([
      {
        action: 'upsert',
        item: { id: 'ag-1', kind: 'agents', name: '助手', sharedBy: 'member-a' },
        pruneChildrenKeepIds: ['sess-1', 'sess-2'],
      },
      {
        action: 'upsert',
        item: {
          id: 'sess-1',
          parentId: 'ag-1',
          parentName: '助手',
          name: '问候',
          sessionPermission: 'callable',
        },
      },
      {
        action: 'upsert',
        item: {
          id: 'sess-2',
          parentId: 'ag-1',
          name: '规划',
          sessionPermission: 'read',
        },
      },
    ])

    const permissionOnly = projectShareableWorkspaceEvent(
      event({
        resourceType: 'Agent',
        eventType: 'Updated',
        payload: {
          assistant_id: 'ag-1',
          session_permissions: { 'sess-1': 'callable', 'sess-2': 'read' },
        },
      }),
    )
    expect(permissionOnly).toMatchObject([
      { action: 'upsert', item: { id: 'ag-1' } },
      {
        action: 'upsert',
        item: { id: 'sess-1', parentId: 'ag-1', sessionPermission: 'callable' },
      },
      {
        action: 'upsert',
        item: { id: 'sess-2', parentId: 'ag-1', sessionPermission: 'read' },
      },
    ])
    expect(permissionOnly[0] && permissionOnly[0].action === 'upsert'
      ? permissionOnly[0].pruneChildrenKeepIds
      : undefined).toBeUndefined()

    const emptyIds = projectShareableWorkspaceEvent(
      event({
        resourceType: 'Agent',
        eventType: 'Shared',
        payload: { assistant_id: 'ag-1', name: '助手', session_ids: [] },
      }),
    )
    expect(emptyIds).toMatchObject([{ action: 'upsert', item: { id: 'ag-1' } }])
    expect(emptyIds[0] && emptyIds[0].action === 'upsert' ? emptyIds[0].pruneChildrenKeepIds : []).toBeUndefined()

    expect(
      projectShareableWorkspaceEvent(
        event({
          resourceType: 'Agent',
          eventType: 'Deleted',
          payload: { assistant_id: 'ag-1' },
        }),
      ),
    ).toEqual([{ action: 'remove', kind: 'agents', id: 'ag-1', cascadeChildren: true }])
    expect(
      projectShareableWorkspaceEvent(
        event({
          resourceType: 'Workflow',
          eventType: 'Shared',
          payload: { workflow_id: 'wf-1', name: '部署', engine: 'langgraph' },
        }),
      ),
    ).toMatchObject([
      { action: 'upsert', item: { id: 'wf-1', kind: 'workflow', preview: 'langgraph' } },
    ])
  })
})
