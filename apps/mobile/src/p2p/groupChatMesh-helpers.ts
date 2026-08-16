import {
  projectShareableWorkspaceEvent,
  type P2pGroupChatMessage,
  type P2pGroupChatWalPayload,
} from '@toolman/shared'
import type { GroupChatMessage } from '../storage/groupChat'
import { requestBlob } from './blobMesh'
import { emitMeshEvent } from './meshEvents'
import { deleteNoteMirror, upsertNoteMirror } from './noteMirror'
import { readLastSeq } from './session'

export type OutboxItem = {
  workspaceId: string
  json: string
}

const SHARE_PROJECTION_REPLAY_KEY = 'toolman.mobile.shareProjectionReplay.v3.'
export const replayUntilSeq = new Map<string, number>()
export const outbox: OutboxItem[] = []

export function shareProjectionReplayDone(workspaceId: string): boolean {
  try {
    return globalThis.localStorage?.getItem(`${SHARE_PROJECTION_REPLAY_KEY}${workspaceId}`) === '1'
  } catch {
    return false
  }
}

export function markShareProjectionReplayDone(workspaceId: string): void {
  try {
    globalThis.localStorage?.setItem(`${SHARE_PROJECTION_REPLAY_KEY}${workspaceId}`, '1')
  } catch {
    // ignore
  }
}

export function markShareProjectionReplayCaughtUp(workspaceId: string): void {
  const until = replayUntilSeq.get(workspaceId)
  if (until == null) return
  if (readLastSeq(workspaceId) >= until) {
    markShareProjectionReplayDone(workspaceId)
    replayUntilSeq.delete(workspaceId)
  }
}

export function toLocalMessage(message: P2pGroupChatMessage): GroupChatMessage {
  const text = message.contentBlocks
    .map((block) => {
      if (block.type === 'text') return block.text
      if (block.type === 'image') return block.alt || '[图片]'
      if (block.type === 'file') return `[文件] ${block.name}`
      return ''
    })
    .filter(Boolean)
    .join('\n')
  const file = message.contentBlocks.find((block) => block.type === 'file' || block.type === 'image')
  return {
    id: message.id,
    groupId: message.workspaceId,
    senderMemberId: message.senderMemberId,
    senderName: message.senderName,
    content: text || '[附件]',
    createdAt: message.createdAt,
    attachment:
      file && (file.type === 'file' || file.type === 'image') && file.blobHash
        ? {
            name: file.type === 'file' ? file.name : file.alt || 'image',
            contentHash: file.blobHash,
            mimeType: file.mimeType || (file.type === 'image' ? 'image/*' : 'application/octet-stream'),
          }
        : undefined,
  }
}

export function applyWal(workspaceId: string, payload: P2pGroupChatWalPayload): void {
  if (payload.kind === 'group.chat.message') {
    emitMeshEvent({ type: 'chat', workspaceId, message: toLocalMessage(payload.message) })
    return
  }
  if (payload.kind === 'group.chat.delete') {
    emitMeshEvent({ type: 'chat-delete', workspaceId, messageId: payload.messageId })
    return
  }
  emitMeshEvent({ type: 'chat-clear', workspaceId })
}

export function applyShareableEvent(
  workspaceId: string,
  event: {
    resourceType: string
    resourceId: string
    eventType: string
    payloadJson: string
    timestamp: number
    operatorId?: string
    sourceDeviceId?: string
  },
): void {
  for (const projection of projectShareableWorkspaceEvent(event)) {
    if (projection.action === 'remove') {
      if (projection.kind === 'notes') {
        deleteNoteMirror(workspaceId, projection.id)
      }
      emitMeshEvent({
        type: 'shared-remove',
        workspaceId,
        kind: projection.kind,
        id: projection.id,
        cascadeChildren: projection.cascadeChildren,
      })
      continue
    }
    emitMeshEvent({
      type: 'shared',
      workspaceId,
      item: projection.item,
    })
    if (projection.pruneChildrenKeepIds) {
      emitMeshEvent({
        type: 'shared-prune-children',
        workspaceId,
        kind: projection.item.kind,
        parentId: projection.item.id,
        keepIds: projection.pruneChildrenKeepIds,
      })
    }
    if (projection.noteBody) {
      upsertNoteMirror({
        workspaceId,
        noteId: projection.noteBody.noteId,
        title: projection.noteBody.title,
        content: projection.noteBody.content,
        permission: projection.noteBody.permission,
        loroOplog: projection.noteBody.loroOplog,
        updatedAt: event.timestamp,
      })
    }
    if (projection.knowledgeBlob) {
      void requestBlob({
        workspaceId,
        contentHash: projection.knowledgeBlob.contentHash,
        title: projection.knowledgeBlob.title,
      })
    }
  }
}
