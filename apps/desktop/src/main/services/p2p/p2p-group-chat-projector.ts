import {
  isGroupChatWorkspaceEvent,
  parseP2pGroupChatWalPayload,
  P2P_GROUP_CHAT_RESOURCE_TYPE,
  type WorkspaceEvent,
} from '@toolman/shared'
import { listWorkspaceEventsSince } from './p2p-event.service'
import {
  broadcastP2pGroupChatCleared,
  broadcastP2pGroupChatMessage,
} from './p2p-group-chat-broadcast'
import {
  appendGroupChatMessage,
  clearGroupChatMessages,
  readGroupChatMessages,
  removeGroupChatMessage,
} from './p2p-group-chat-store'

export interface ProjectGroupChatEventOptions {
  /** When true, skip renderer IPC broadcasts (replay / tests). */
  suppressBroadcast?: boolean
}

export function projectGroupChatEvent(
  event: WorkspaceEvent,
  options: ProjectGroupChatEventOptions = {},
): void {
  if (!isGroupChatWorkspaceEvent(event)) {
    return
  }

  const payload = parseP2pGroupChatWalPayload(event.payload)
  const suppressBroadcast = options.suppressBroadcast === true

  switch (payload.kind) {
    case 'group.chat.message': {
      const inserted = appendGroupChatMessage(payload.message)
      if (inserted && !suppressBroadcast) {
        broadcastP2pGroupChatMessage(payload.message)
      }
      return
    }
    case 'group.chat.delete':
      removeGroupChatMessage(payload.workspaceId, payload.messageId)
      return
    case 'group.chat.clear': {
      const cleared = clearGroupChatMessages(payload.workspaceId)
      if (cleared && !suppressBroadcast) {
        broadcastP2pGroupChatCleared(payload.workspaceId)
      }
      return
    }
  }
}

/** Phase B: replay GroupChat WAL rows into local JSON after sync catch-up. */
export function reprojectGroupChatWalEvents(
  workspaceId: string,
  events: WorkspaceEvent[],
  options: ProjectGroupChatEventOptions = {},
): void {
  const ordered = events
    .filter(
      (event) =>
        event.workspaceId === workspaceId && event.resourceType === P2P_GROUP_CHAT_RESOURCE_TYPE,
    )
    .sort((a, b) => a.seq - b.seq)

  for (const event of ordered) {
    projectGroupChatEvent(event, options)
  }
}

/** Reconcile JSON projection from authoritative WAL (suppresses UI broadcast). */
export function reconcileGroupChatProjection(
  workspaceId: string,
  options: Pick<ProjectGroupChatEventOptions, 'suppressBroadcast'> = {},
): number {
  const events = listWorkspaceEventsSince(workspaceId, 0, 5000).filter(
    (event) => event.resourceType === P2P_GROUP_CHAT_RESOURCE_TYPE,
  )
  reprojectGroupChatWalEvents(workspaceId, events, {
    suppressBroadcast: options.suppressBroadcast ?? true,
  })
  return readGroupChatMessages(workspaceId).length
}
