import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const STORE_KEY = 'toolman.mobile.groupChat.v1'

export type GroupWorkspace = {
  id: string
  name: string
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

export type GroupChatStore = {
  groups: GroupWorkspace[]
  activeGroupId: string | null
  messagesByGroup: Record<string, GroupChatMessage[]>
}

const EMPTY: GroupChatStore = {
  groups: [],
  activeGroupId: null,
  messagesByGroup: {},
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
  return { id: g.id, name: g.name, createdAt: g.createdAt, updatedAt: g.updatedAt }
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
    if (!raw) return { ...EMPTY, messagesByGroup: {} }
    const parsed = JSON.parse(raw) as {
      groups?: unknown
      activeGroupId?: unknown
      messagesByGroup?: unknown
    }
    const groups = Array.isArray(parsed.groups)
      ? parsed.groups.map(normalizeGroup).filter((g): g is GroupWorkspace => Boolean(g))
      : []
    const messagesByGroup: Record<string, GroupChatMessage[]> = {}
    if (parsed.messagesByGroup && typeof parsed.messagesByGroup === 'object') {
      for (const [groupId, list] of Object.entries(
        parsed.messagesByGroup as Record<string, unknown>,
      )) {
        if (!Array.isArray(list)) continue
        messagesByGroup[groupId] = list
          .map(normalizeMessage)
          .filter((m): m is GroupChatMessage => Boolean(m))
      }
    }
    const activeGroupId =
      typeof parsed.activeGroupId === 'string' &&
      groups.some((g) => g.id === parsed.activeGroupId)
        ? parsed.activeGroupId
        : (groups[0]?.id ?? null)
    return { groups, activeGroupId, messagesByGroup }
  } catch {
    return { ...EMPTY, messagesByGroup: {} }
  }
}

export async function saveGroupChatStore(store: GroupChatStore): Promise<void> {
  await setItem(STORE_KEY, JSON.stringify(store))
}
