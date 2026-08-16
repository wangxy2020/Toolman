import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { loadScopedRaw, saveScopedRaw } from '../storage/identityScope'
import { pendingInviteFromInput, type PendingP2pInvite } from './inviteParse'

export type { PendingP2pInvite }
export { pendingInviteFromInput }

const STORE_KEY = 'toolman.mobile.pendingP2pInvites.v1'

type Listener = (invites: PendingP2pInvite[]) => void

const listeners = new Set<Listener>()
let cached: PendingP2pInvite[] | null = null

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

function normalizePending(value: unknown): PendingP2pInvite | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<PendingP2pInvite>
  if (typeof item.raw !== 'string' || typeof item.token !== 'string') return null
  if (typeof item.receivedAt !== 'number') return null
  return {
    raw: item.raw,
    token: item.token,
    bundled: typeof item.bundled === 'string' ? item.bundled : undefined,
    workspaceId: typeof item.workspaceId === 'string' ? item.workspaceId : undefined,
    workspaceName: typeof item.workspaceName === 'string' ? item.workspaceName : undefined,
    ownerIdentityId: typeof item.ownerIdentityId === 'string' ? item.ownerIdentityId : undefined,
    ownerDeviceId: typeof item.ownerDeviceId === 'string' ? item.ownerDeviceId : undefined,
    ownerDisplayName: typeof item.ownerDisplayName === 'string' ? item.ownerDisplayName : undefined,
    role: typeof item.role === 'string' ? item.role : undefined,
    expiresAt: typeof item.expiresAt === 'number' ? item.expiresAt : undefined,
    hubUrls: Array.isArray(item.hubUrls)
      ? item.hubUrls.filter((url): url is string => typeof url === 'string' && Boolean(url.trim()))
      : undefined,
    receivedAt: item.receivedAt,
  }
}

function emit(invites: PendingP2pInvite[]): void {
  cached = invites
  for (const listener of listeners) listener(invites)
}

export async function loadPendingInvites(): Promise<PendingP2pInvite[]> {
  if (cached) return cached
  try {
    const raw = await loadScopedRaw(STORE_KEY, getItem, setItem)
    if (!raw) {
      cached = []
      return cached
    }
    const parsed = JSON.parse(raw) as unknown
    cached = Array.isArray(parsed)
      ? parsed.map(normalizePending).filter((item): item is PendingP2pInvite => item != null)
      : []
    return cached
  } catch {
    cached = []
    return cached
  }
}

export async function savePendingInvite(invite: PendingP2pInvite): Promise<PendingP2pInvite[]> {
  const current = await loadPendingInvites()
  const key = invite.workspaceId || invite.token || invite.raw
  const next = [
    invite,
    ...current.filter((item) => (item.workspaceId || item.token || item.raw) !== key),
  ]
  await saveScopedRaw(STORE_KEY, JSON.stringify(next), setItem)
  emit(next)
  return next
}

export async function enqueueInviteFromInput(input: string): Promise<PendingP2pInvite | null> {
  const invite = pendingInviteFromInput(input)
  if (!invite) return null
  await savePendingInvite(invite)
  return invite
}

export async function consumePendingInvites(): Promise<PendingP2pInvite[]> {
  const current = await loadPendingInvites()
  if (current.length === 0) return []
  await saveScopedRaw(STORE_KEY, JSON.stringify([]), setItem)
  emit([])
  return current
}

export function resetPendingInvitesCache(): void {
  cached = null
}

export function subscribePendingInvites(listener: Listener): () => void {
  listeners.add(listener)
  if (cached) listener(cached)
  return () => {
    listeners.delete(listener)
  }
}
