import type {
  GroupActivity,
  GroupChatMessage,
  GroupInvite,
  GroupMember,
  GroupMemberRole,
  GroupSharedItem,
  GroupWorkspace,
} from './groupChat-types'

export function normalizeGroup(value: unknown): GroupWorkspace | null {
  if (!value || typeof value !== 'object') return null
  const g = value as Partial<GroupWorkspace>
  if (
    typeof g.id !== 'string' ||
    typeof g.name !== 'string' ||
    typeof g.createdAt !== 'number' ||
    typeof g.updatedAt !== 'number'
  ) {
    return null
  }
  return {
    id: g.id,
    name: g.name,
    description: typeof g.description === 'string' ? g.description : undefined,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
    origin: g.origin === 'desktop' ? 'desktop' : 'local',
    ownerIdentityId: typeof g.ownerIdentityId === 'string' ? g.ownerIdentityId : undefined,
    ownerDeviceId: typeof g.ownerDeviceId === 'string' ? g.ownerDeviceId : undefined,
  }
}

export function normalizeMember(value: unknown): GroupMember | null {
  if (!value || typeof value !== 'object') return null
  const m = value as Partial<GroupMember>
  if (typeof m.id !== 'string' || typeof m.displayName !== 'string') return null
  const role: GroupMemberRole =
    m.role === 'owner' || m.role === 'admin' || m.role === 'readonly' ? m.role : 'member'
  return {
    id: m.id,
    displayName: m.displayName,
    role,
    deviceId: typeof m.deviceId === 'string' ? m.deviceId : m.id,
    identityId: typeof m.identityId === 'string' && m.identityId ? m.identityId : undefined,
    deviceKind: m.deviceKind === 'mobile' || m.deviceKind === 'desktop' ? m.deviceKind : undefined,
    online: m.online !== false,
    status: m.status === 'invited' ? 'invited' : 'active',
  }
}

export function normalizeShared(value: unknown): GroupSharedItem | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<GroupSharedItem>
  if (typeof item.id !== 'string' || typeof item.name !== 'string') return null
  if (
    item.kind !== 'agents' &&
    item.kind !== 'knowledge' &&
    item.kind !== 'notes' &&
    item.kind !== 'workflow'
  ) {
    return null
  }
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    parentId: typeof item.parentId === 'string' ? item.parentId : undefined,
    parentName: typeof item.parentName === 'string' ? item.parentName : undefined,
    addedAt: typeof item.addedAt === 'number' ? item.addedAt : Date.now(),
    permission:
      item.permission === 'read' || item.permission === 'write' || item.permission === 'admin'
        ? item.permission
        : undefined,
    contentHash: typeof item.contentHash === 'string' ? item.contentHash : undefined,
    mimeType: typeof item.mimeType === 'string' ? item.mimeType : undefined,
    preview: typeof item.preview === 'string' ? item.preview : undefined,
    sessionPermission:
      item.sessionPermission === 'read' || item.sessionPermission === 'callable'
        ? item.sessionPermission
        : undefined,
    sharedBy: typeof item.sharedBy === 'string' ? item.sharedBy : undefined,
    sourceAssistantId: typeof item.sourceAssistantId === 'string' ? item.sourceAssistantId : undefined,
    referencedModelId: typeof item.referencedModelId === 'string' ? item.referencedModelId : undefined,
    ownerDeviceId: typeof item.ownerDeviceId === 'string' ? item.ownerDeviceId : undefined,
  }
}

export function normalizeActivity(value: unknown): GroupActivity | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<GroupActivity>
  if (
    typeof item.id !== 'string' ||
    typeof item.message !== 'string' ||
    typeof item.resourceLabel !== 'string' ||
    typeof item.seq !== 'number' ||
    typeof item.timestamp !== 'number'
  ) {
    return null
  }
  return {
    id: item.id,
    seq: item.seq,
    timestamp: item.timestamp,
    message: item.message,
    resourceLabel: item.resourceLabel,
    sourceDeviceId: typeof item.sourceDeviceId === 'string' ? item.sourceDeviceId : undefined,
  }
}

export function normalizeInvite(value: unknown): GroupInvite | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<GroupInvite>
  if (
    typeof item.token !== 'string' ||
    typeof item.url !== 'string' ||
    typeof item.expiresAt !== 'number'
  ) {
    return null
  }
  return { token: item.token, url: item.url, expiresAt: item.expiresAt }
}

export function mapRecord<T>(
  raw: unknown,
  normalize: (value: unknown) => T | null,
): Record<string, T[]> {
  const next: Record<string, T[]> = {}
  if (!raw || typeof raw !== 'object') return next
  for (const [key, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue
    next[key] = list.map(normalize).filter((item): item is T => item != null)
  }
  return next
}

export function mapInviteRecord(raw: unknown): Record<string, GroupInvite> {
  const next: Record<string, GroupInvite> = {}
  if (!raw || typeof raw !== 'object') return next
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const invite = normalizeInvite(value)
    if (invite) next[key] = invite
  }
  return next
}

export function normalizeMessage(value: unknown): GroupChatMessage | null {
  if (!value || typeof value !== 'object') return null
  const m = value as Partial<GroupChatMessage>
  if (
    typeof m.id !== 'string' ||
    typeof m.groupId !== 'string' ||
    typeof m.senderMemberId !== 'string' ||
    typeof m.senderName !== 'string' ||
    typeof m.content !== 'string' ||
    typeof m.createdAt !== 'number'
  ) {
    return null
  }
  const attachment = m.attachment
  return {
    id: m.id,
    groupId: m.groupId,
    senderMemberId: m.senderMemberId,
    senderName: m.senderName,
    content: m.content,
    createdAt: m.createdAt,
    attachment:
      attachment &&
      typeof attachment.name === 'string' &&
      typeof attachment.contentHash === 'string' &&
      typeof attachment.mimeType === 'string'
        ? attachment
        : undefined,
  }
}
