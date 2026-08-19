import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { loadScopedRaw, saveScopedRaw } from './identityScope'
import {
  EMPTY_GROUP_CHAT_STORE,
  type GroupChatStore,
  type GroupWorkspace,
  groupMemberRoleLabel,
  shortDeviceId,
} from './groupChat-types'
import {
  mapInviteRecord,
  mapRecord,
  normalizeActivity,
  normalizeGroup,
  normalizeMember,
  normalizeMessage,
  normalizeShared,
} from './groupChat-normalize'

export type {
  GroupActivity,
  GroupAgentSessionPermission,
  GroupChatAttachment,
  GroupChatMessage,
  GroupChatStore,
  GroupDeviceKind,
  GroupInvite,
  GroupMember,
  GroupMemberRole,
  GroupSharedItem,
  GroupSharedKind,
  GroupWorkspace,
} from './groupChat-types'

export { groupMemberRoleLabel, shortDeviceId, EMPTY_GROUP_CHAT_STORE }

const STORE_KEY = 'toolman.mobile.groupChat.v1'

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

async function removeItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.removeItem(key)
    } catch {
      // ignore
    }
    return
  }
  try {
    await SecureStore.deleteItemAsync(key)
  } catch {
    // ignore
  }
}

export async function loadGroupChatStore(): Promise<GroupChatStore> {
  try {
    const raw = await loadScopedRaw(STORE_KEY, getItem, setItem, removeItem)
    if (!raw) return { ...EMPTY_GROUP_CHAT_STORE }
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
    return { ...EMPTY_GROUP_CHAT_STORE }
  }
}

export async function saveGroupChatStore(store: GroupChatStore): Promise<void> {
  await saveScopedRaw(STORE_KEY, JSON.stringify(store), setItem)
}
