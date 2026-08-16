import type {
  GroupChatMessage,
  GroupMember,
  GroupSharedItem,
  GroupSharedKind,
} from '../storage/groupChat'

export type MeshUiEvent =
  | { type: 'connected'; workspaceId: string }
  | { type: 'disconnected'; workspaceId: string }
  | { type: 'presence'; workspaceId: string; deviceId: string; online: boolean }
  | {
      type: 'roster'
      workspaceId: string
      members: GroupMember[]
      ownerIdentityId?: string
      ownerDeviceId?: string
    }
  | { type: 'chat'; workspaceId: string; message: GroupChatMessage }
  | { type: 'chat-delete'; workspaceId: string; messageId: string }
  | { type: 'chat-clear'; workspaceId: string }
  | { type: 'shared'; workspaceId: string; item: GroupSharedItem }
  | {
      type: 'shared-remove'
      workspaceId: string
      kind: GroupSharedKind
      id: string
      cascadeChildren: boolean
    }
  | {
      type: 'shared-prune-children'
      workspaceId: string
      kind: GroupSharedKind
      parentId: string
      keepIds: string[]
    }

const listeners = new Set<(event: MeshUiEvent) => void>()

export function subscribeMeshEvents(listener: (event: MeshUiEvent) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function emitMeshEvent(event: MeshUiEvent): void {
  for (const listener of listeners) listener(event)
}
