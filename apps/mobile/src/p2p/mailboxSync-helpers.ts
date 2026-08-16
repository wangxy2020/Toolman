import {
  DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL,
  OFFICIAL_TOOLMAN_HUB_URL,
  hostnameOfBaseUrl,
  isOfficialCommunityHubHost,
  isPrivateOrLoopbackHostname,
} from '@toolman/shared'
import { scopedStorageKey } from '../storage/identityScopeCore'

export const MAILBOX_SEQ_KEY = 'toolman.mobile.p2p.mailboxCursor.v1'
export const MAILBOX_PULL_LIMIT = 200
export const PERSIST_KEY = 'toolman.mobile.p2p.mailboxTargets.v1'

const mailboxCursors = new Map<string, number>()

export function mailboxCursorStorageKey(workspaceId: string, hubUrl: string): string {
  return `${workspaceId}::${hubUrl}`
}

function readPersistedMailboxCursors(): Record<string, number> {
  try {
    const raw = globalThis.localStorage?.getItem(scopedStorageKey(MAILBOX_SEQ_KEY))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {}
  } catch {
    return {}
  }
}

export function readMailboxSeq(workspaceId: string, hubUrl: string): number {
  const key = mailboxCursorStorageKey(workspaceId, hubUrl)
  const memory = mailboxCursors.get(key) ?? 0
  const stored = readPersistedMailboxCursors()[key]
  const persisted = typeof stored === 'number' && Number.isFinite(stored) && stored > 0 ? stored : 0
  return Math.max(memory, persisted)
}

export function rememberMailboxSeq(workspaceId: string, hubUrl: string, seq: number): void {
  if (!Number.isFinite(seq) || seq <= 0) return
  const key = mailboxCursorStorageKey(workspaceId, hubUrl)
  const current = readMailboxSeq(workspaceId, hubUrl)
  if (seq <= current) return
  mailboxCursors.set(key, seq)
  try {
    const next = readPersistedMailboxCursors()
    next[key] = seq
    globalThis.localStorage?.setItem(scopedStorageKey(MAILBOX_SEQ_KEY), JSON.stringify(next))
  } catch {
    // memory cursor is enough for this session
  }
}

export const boundFetch: typeof fetch = (input, init) => globalThis.fetch.call(globalThis, input, init)

export type MailboxSyncTarget = {
  hubUrl: string
  workspaceId: string
  deviceId: string
  workspaceKey: Uint8Array
  inviteToken?: string
  ownerDeviceId?: string
}

export type PersistedMailboxTarget = {
  hubUrl: string
  workspaceId: string
  deviceId: string
  workspaceKeyB64: string
  inviteToken?: string
  ownerDeviceId?: string
}

export const mailboxTargets = new Map<string, MailboxSyncTarget>()
export const mailboxTimers = new Map<string, ReturnType<typeof setInterval>>()

export function encodeKeyB64(key: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(key).toString('base64')
  let binary = ''
  for (const byte of key) binary += String.fromCharCode(byte)
  return globalThis.btoa(binary)
}

export function readPersistedTargets(): PersistedMailboxTarget[] {
  try {
    const raw = globalThis.localStorage?.getItem(scopedStorageKey(PERSIST_KEY))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as PersistedMailboxTarget[]) : []
  } catch {
    return []
  }
}

export function persistTarget(target: MailboxSyncTarget): void {
  try {
    const next = readPersistedTargets().filter((item) => item.workspaceId !== target.workspaceId)
    next.push({
      hubUrl: target.hubUrl,
      workspaceId: target.workspaceId,
      deviceId: target.deviceId,
      workspaceKeyB64: encodeKeyB64(target.workspaceKey),
      inviteToken: target.inviteToken,
      ownerDeviceId: target.ownerDeviceId,
    })
    globalThis.localStorage?.setItem(scopedStorageKey(PERSIST_KEY), JSON.stringify(next))
  } catch {
    // ignore
  }
}

export function hubLooksLikeOwnerDesktop(hubUrl: string): boolean {
  const host = hostnameOfBaseUrl(hubUrl)
  return !isOfficialCommunityHubHost(host) && isPrivateOrLoopbackHostname(host)
}

export async function postJson(hubUrl: string, path: string, body: unknown): Promise<unknown> {
  const res = await boundFetch(`${hubUrl.replace(/\/+$/, '')}${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const error =
      json && typeof json === 'object' && 'error' in json && typeof json.error === 'string'
        ? json.error
        : `mailbox ${path} failed (${res.status})`
    throw new Error(error)
  }
  if (json && typeof json === 'object' && 'data' in json) {
    return (json as { data: unknown }).data
  }
  return json
}

export function mailboxHubs(primary: string): string[] {
  const hubs = [primary, DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL, OFFICIAL_TOOLMAN_HUB_URL]
  return hubs.filter((url, index) => hubs.indexOf(url) === index)
}
