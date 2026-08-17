export type GroupWorkspace = {
  id: string
  name: string
  description?: string
  createdAt: number
  updatedAt: number
  /** Desktop P2P workspaces arrive via Sync Hub; local groups stay on this device. */
  origin?: 'local' | 'desktop'
  ownerIdentityId?: string
  ownerDeviceId?: string
}

export type GroupChatAttachment = {
  name: string
  contentHash: string
  mimeType: string
}

/** Member chat message (not LLM). Aligns with desktop P2pGroupChatMessage shape for UI. */
export type GroupChatMessage = {
  id: string
  groupId: string
  senderMemberId: string
  senderName: string
  content: string
  createdAt: number
  attachment?: GroupChatAttachment
}

export type GroupMemberRole = 'owner' | 'admin' | 'member' | 'readonly'

export type GroupDeviceKind = 'desktop' | 'mobile' | 'web'

export type GroupMember = {
  id: string
  displayName: string
  role: GroupMemberRole
  deviceId: string
  identityId?: string
  deviceKind?: GroupDeviceKind
  online: boolean
  status: 'active' | 'invited'
}

export type GroupSharedKind = 'agents' | 'knowledge' | 'notes' | 'workflow'

export type GroupAgentSessionPermission = 'read' | 'callable'

export type GroupSharedItem = {
  id: string
  name: string
  kind: GroupSharedKind
  parentId?: string
  parentName?: string
  addedAt: number
  permission?: 'read' | 'write' | 'admin'
  contentHash?: string
  mimeType?: string
  preview?: string
  sessionPermission?: GroupAgentSessionPermission
  sharedBy?: string
  sourceAssistantId?: string
  referencedModelId?: string
  ownerDeviceId?: string
}

export type GroupActivity = {
  id: string
  seq: number
  timestamp: number
  message: string
  resourceLabel: string
  sourceDeviceId?: string
}

export type GroupInvite = {
  token: string
  url: string
  expiresAt: number
}

export type GroupChatStore = {
  groups: GroupWorkspace[]
  activeGroupId: string | null
  messagesByGroup: Record<string, GroupChatMessage[]>
  membersByGroup: Record<string, GroupMember[]>
  sharedByGroup: Record<string, GroupSharedItem[]>
  activitiesByGroup: Record<string, GroupActivity[]>
  invitesByGroup: Record<string, GroupInvite>
}

export const EMPTY_GROUP_CHAT_STORE: GroupChatStore = {
  groups: [],
  activeGroupId: null,
  messagesByGroup: {},
  membersByGroup: {},
  sharedByGroup: {},
  activitiesByGroup: {},
  invitesByGroup: {},
}

export function shortDeviceId(deviceId: string): string {
  if (deviceId.length <= 16) return deviceId
  return `${deviceId.slice(0, 8)}…${deviceId.slice(-4)}`
}

export function groupMemberRoleLabel(role: GroupMemberRole): string {
  if (role === 'admin') return '管理员'
  if (role === 'member') return '成员'
  if (role === 'readonly') return '只读'
  return '群主'
}
