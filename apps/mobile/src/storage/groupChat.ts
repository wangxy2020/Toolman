import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const STORE_KEY = 'toolman.mobile.groupChat.v1'

export type GroupWorkspace = {
  id: string
  name: string
  description?: string
  createdAt: number
  updatedAt: number
}

/** Member chat message (not LLM). Aligns with desktop P2pGroupChatMessage shape for UI. */
export type GroupChatMessage = {
  id: string
  groupId: string
  senderMemberId: string
  senderName: string
  content: string
  createdAt: number
}

export type GroupMemberRole = 'owner' | 'admin' | 'member' | 'readonly'

export type GroupMember = {
  id: string
  displayName: string
  role: GroupMemberRole
  deviceId: string
  online: boolean
  status: 'active' | 'invited'
}

export type GroupSharedKind = 'agents' | 'knowledge' | 'notes' | 'workflow'

export type GroupSharedItem = {
  id: string
  name: string
  kind: GroupSharedKind
  parentId?: string
  parentName?: string
  addedAt: number
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

const EMPTY: GroupChatStore = {
  groups: [],
  activeGroupId: null,
  messagesByGroup: {},
  membersByGroup: {},
  sharedByGroup: {},
  activitiesByGroup: {},
  invitesByGroup: {},
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(key) ?? null
    } catch {
      return null
    }
  }
  try {
    return await SecureStore.getItemAsync(key)
  } catch {
    return null
  }
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(key, value)
    } catch {
      // ignore
    }
    return
  }
  await SecureStore.setItemAsync(key, value)
}

function normalizeGroup(value: unknown): GroupWorkspace | null {
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
  }
}

function normalizeMember(value: unknown): GroupMember | null {
  if (!value || typeof value !== 'object') return null
  const m = value as Partial<GroupMember>
  if (typeof m.id !== 'string' || typeof m.displayName !== 'string') return null
  const role: GroupMemberRole =
    m.role === 'admin' || m.role === 'member' || m.role === 'readonly' ? m.role : 'owner'
  return {
    id: m.id,
    displayName: m.displayName,
    role,
    deviceId: typeof m.deviceId === 'string' ? m.deviceId : m.id,
    online: m.online !== false,
    status: m.status === 'invited' ? 'invited' : 'active',
  }
}

function normalizeShared(value: unknown): GroupSharedItem | null {
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
  }
}

function normalizeActivity(value: unknown): GroupActivity | null {
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

function normalizeInvite(value: unknown): GroupInvite | null {
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

function mapRecord<T>(
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

function mapInviteRecord(raw: unknown): Record<string, GroupInvite> {
  const next: Record<string, GroupInvite> = {}
  if (!raw || typeof raw !== 'object') return next
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const invite = normalizeInvite(value)
    if (invite) next[key] = invite
  }
  return next
}

function normalizeMessage(value: unknown): GroupChatMessage | null {
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
  return {
    id: m.id,
    groupId: m.groupId,
    senderMemberId: m.senderMemberId,
    senderName: m.senderName,
    content: m.content,
    createdAt: m.createdAt,
  }
}

export async function loadGroupChatStore(): Promise<GroupChatStore> {
  try {
    const raw = await getItem(STORE_KEY)
    if (!raw) return { ...EMPTY }
    const parsed = JSON.parse(raw) as {
      groups?: unknown
      activeGroupId?: unknown
      messagesByGroup?: unknown
      membersByGroup?: unknown
      sharedByGroup?: unknown
      activitiesByGroup?: unknown
      invitesByGroup?: unknown
    }
    const groups = Array.isArray(parsed.groups)
      ? parsed.groups.map(normalizeGroup).filter((g): g is GroupWorkspace => Boolean(g))
      : []
    const messagesByGroup = mapRecord(parsed.messagesByGroup, normalizeMessage)
    const membersByGroup = mapRecord(parsed.membersByGroup, normalizeMember)
    const sharedByGroup = mapRecord(parsed.sharedByGroup, normalizeShared)
    const activitiesByGroup = mapRecord(parsed.activitiesByGroup, normalizeActivity)
    const invitesByGroup = mapInviteRecord(parsed.invitesByGroup)
    const activeGroupId =
      typeof parsed.activeGroupId === 'string' &&
      groups.some((g) => g.id === parsed.activeGroupId)
        ? parsed.activeGroupId
        : (groups[0]?.id ?? null)
    return {
      groups,
      activeGroupId,
      messagesByGroup,
      membersByGroup,
      sharedByGroup,
      activitiesByGroup,
      invitesByGroup,
    }
  } catch {
    return { ...EMPTY }
  }
}

export async function saveGroupChatStore(store: GroupChatStore): Promise<void> {
  await setItem(STORE_KEY, JSON.stringify(store))
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
