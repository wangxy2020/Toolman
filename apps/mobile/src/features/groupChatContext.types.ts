import type {
  GroupActivity,
  GroupChatMessage,
  GroupInvite,
  GroupMember,
  GroupMemberRole,
  GroupSharedItem,
  GroupSharedKind,
  GroupWorkspace,
} from '../storage/groupChat'
import type { GroupSidebarAction } from './groupSidebar'

export type GroupChatContextValue = {
  ready: boolean
  groups: GroupWorkspace[]
  activeGroupId: string | null
  activeAction: GroupSidebarAction
  messages: GroupChatMessage[]
  members: GroupMember[]
  sharedItems: GroupSharedItem[]
  activities: GroupActivity[]
  createGroup: () => void
  selectGroup: (id: string) => void
  selectGroupAction: (groupId: string, action: GroupSidebarAction) => void
  expanded: Set<string>
  toggleExpanded: (groupId: string) => void
  updateGroup: (id: string, patch: { name: string; description?: string }) => void
  dissolveGroup: (id: string) => void
  sendMessage: (input: {
    content: string
    senderMemberId: string
    senderName: string
    attachment?: { name: string; contentHash: string; mimeType: string }
  }) => void
  attachFile: (file: { name: string; mimeType: string; bytes: Uint8Array }) => Promise<void>
  deleteMessage: (id: string) => void
  /** Remove only messages sent by this member on the local page. */
  clearOwnMessages: (senderMemberId: string) => void
  addSharedItems: (
    kind: GroupSharedKind,
    items: GroupSharedItem[],
    extras?: { noteBodies?: Record<string, string> },
  ) => void
  updateSharedNote: (itemId: string, content: string) => void
  canShareToActiveGroup: boolean
  getSharedNoteBody: (itemId: string) => string | undefined
  createOrReuseInvite: () => GroupInvite | null
  joinGroupByInvite: (input: string) => { ok: true } | { ok: false; message: string }
  openSettingsModal: () => void
  removeMember: (memberId: string) => Promise<void>
  updateMemberRole: (memberId: string, role: GroupMemberRole) => Promise<void>
}

export type GroupChatSelf = {
  selfIdentityId: string
  selfDeviceId: string
  selfMemberId: string
  selfName: string
}
