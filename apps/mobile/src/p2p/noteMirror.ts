/**
 * Group-shared note projection. Kept out of the personal notes store so
 * Sync Hub (same-user) and mesh (cross-user) never mix.
 */
import { getCurrentDataIdentity } from '../storage/identityScopeCore'

export type GroupNoteMirror = {
  workspaceId: string
  noteId: string
  title: string
  content: string
  permission: 'read' | 'write'
  loroOplog?: string
  updatedAt: number
}

const STORE_KEY = 'toolman.mobile.p2p.noteMirrors.v1'
const mirrors = new Map<string, GroupNoteMirror>()
let hydrated = false

function persistKey(): string {
  const id = getCurrentDataIdentity()?.trim()
  return id ? `${STORE_KEY}::${id}` : `${STORE_KEY}::anon`
}

function keyOf(workspaceId: string, noteId: string): string {
  return `${workspaceId}:${noteId}`
}

function persist(): void {
  try {
    const rows = Array.from(mirrors.values())
    globalThis.localStorage?.setItem(persistKey(), JSON.stringify(rows))
  } catch {
    // ignore
  }
}

function hydrate(): void {
  if (hydrated) return
  hydrated = true
  try {
    const raw = globalThis.localStorage?.getItem(persistKey())
    if (!raw) return
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue
      const item = row as Partial<GroupNoteMirror>
      if (
        typeof item.workspaceId !== 'string' ||
        typeof item.noteId !== 'string' ||
        typeof item.title !== 'string' ||
        typeof item.content !== 'string'
      ) {
        continue
      }
      mirrors.set(keyOf(item.workspaceId, item.noteId), {
        workspaceId: item.workspaceId,
        noteId: item.noteId,
        title: item.title,
        content: item.content,
        permission: item.permission === 'write' ? 'write' : 'read',
        loroOplog: typeof item.loroOplog === 'string' ? item.loroOplog : undefined,
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : 0,
      })
    }
  } catch {
    // ignore
  }
}

export function upsertNoteMirror(input: {
  workspaceId: string
  noteId: string
  title: string
  content?: string
  permission?: 'read' | 'write'
  loroOplog?: string
  updatedAt?: number
}): GroupNoteMirror {
  hydrate()
  const key = keyOf(input.workspaceId, input.noteId)
  const existing = mirrors.get(key)
  const next: GroupNoteMirror = {
    workspaceId: input.workspaceId,
    noteId: input.noteId,
    title: input.title || existing?.title || '共享笔记',
    content: input.content !== undefined ? input.content : existing?.content ?? '',
    permission: input.permission ?? existing?.permission ?? 'read',
    loroOplog: input.loroOplog ?? existing?.loroOplog,
    updatedAt: input.updatedAt ?? Date.now(),
  }
  mirrors.set(key, next)
  persist()
  return next
}

export function getNoteMirror(workspaceId: string, noteId: string): GroupNoteMirror | undefined {
  hydrate()
  return mirrors.get(keyOf(workspaceId, noteId))
}

export function deleteNoteMirror(workspaceId: string, noteId: string): void {
  hydrate()
  if (mirrors.delete(keyOf(workspaceId, noteId))) persist()
}

export function listNoteMirrors(workspaceId: string): GroupNoteMirror[] {
  hydrate()
  return Array.from(mirrors.values()).filter((item) => item.workspaceId === workspaceId)
}

export function resetNoteMirrorsForTests(): void {
  mirrors.clear()
  hydrated = true
}

export function switchNoteMirrorsForIdentity(): void {
  persist()
  mirrors.clear()
  hydrated = false
}
