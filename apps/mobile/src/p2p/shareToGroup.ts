import { canWriteWorkspace } from '@toolman/shared'
import type { GroupMember, GroupSharedItem, GroupSharedKind, GroupWorkspace } from '../storage/groupChat'
import { upsertNoteMirror } from './noteMirror'
import { proposeWorkspaceEvent } from './sharePropose'
import { hasLiveSession } from './session'

export function canShareToDesktopGroup(input: {
  group?: GroupWorkspace
  selfMember?: GroupMember
}): boolean {
  if (input.group?.origin !== 'desktop') return false
  return canWriteWorkspace(input.selfMember?.role)
}

export async function proposePickerShares(input: {
  workspaceId: string
  kind: GroupSharedKind
  items: GroupSharedItem[]
  operatorId: string
  sourceDeviceId: string
  noteBodies?: Record<string, string>
}): Promise<void> {
  if (!hasLiveSession(input.workspaceId)) return
  if (input.kind === 'notes') {
    for (const item of input.items) {
      const body = input.noteBodies?.[item.id] ?? item.preview ?? ''
      upsertNoteMirror({
        workspaceId: input.workspaceId,
        noteId: item.id,
        title: item.name,
        content: body,
        permission: 'write',
      })
      await proposeWorkspaceEvent({
        workspaceId: input.workspaceId,
        resourceType: 'Note',
        resourceId: item.id,
        operatorId: input.operatorId,
        eventType: 'Shared',
        sourceDeviceId: input.sourceDeviceId,
        payload: {
          note_id: item.id,
          notebook_id: item.parentId ?? 'notebook-default',
          notebook_name: item.parentName ?? '笔记本',
          title: item.name,
          permission: 'read',
        },
      })
      if (body) {
        await proposeWorkspaceEvent({
          workspaceId: input.workspaceId,
          resourceType: 'Note',
          resourceId: item.id,
          operatorId: input.operatorId,
          eventType: 'Updated',
          sourceDeviceId: input.sourceDeviceId,
          payload: {
            note_id: item.id,
            title: item.name,
            content: body,
          },
        })
      }
    }
    return
  }
  if (input.kind === 'knowledge') {
    const kbs = new Map<string, GroupSharedItem>()
    for (const item of input.items) {
      if (item.parentId) {
        if (!kbs.has(item.parentId)) {
          kbs.set(item.parentId, {
            id: item.parentId,
            name: item.parentName || '知识库',
            kind: 'knowledge',
            addedAt: item.addedAt,
          })
        }
        continue
      }
      kbs.set(item.id, item)
    }
    for (const kb of kbs.values()) {
      await proposeWorkspaceEvent({
        workspaceId: input.workspaceId,
        resourceType: 'Knowledge',
        resourceId: kb.id,
        operatorId: input.operatorId,
        eventType: 'Shared',
        sourceDeviceId: input.sourceDeviceId,
        payload: {
          kb_id: kb.id,
          name: kb.name,
        },
      })
    }
    return
  }
}

export async function proposeSharedNoteUpdate(input: {
  workspaceId: string
  noteId: string
  title: string
  content: string
  operatorId: string
  sourceDeviceId: string
}): Promise<{ ok: true } | { ok: false; message: string }> {
  upsertNoteMirror({
    workspaceId: input.workspaceId,
    noteId: input.noteId,
    title: input.title,
    content: input.content,
    permission: 'write',
  })
  return proposeWorkspaceEvent({
    workspaceId: input.workspaceId,
    resourceType: 'Note',
    resourceId: input.noteId,
    operatorId: input.operatorId,
    eventType: 'Updated',
    sourceDeviceId: input.sourceDeviceId,
    payload: {
      note_id: input.noteId,
      title: input.title,
      content: input.content,
    },
  })
}
