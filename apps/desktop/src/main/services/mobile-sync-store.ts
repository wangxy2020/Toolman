/**
 * File-backed Sync change log used by the desktop local Sync Hub.
 * Last-write-wins per entityId; cursor is a monotonic sequence number string.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type { SyncChange } from '@toolman/shared'
import { logStructured } from './structured-log.service'

type StoredChange = SyncChange & { seq: number }

type SyncStoreFile = {
  seq: number
  changes: StoredChange[]
}

const STORE_PATH = () => join(app.getPath('userData'), 'mobile-sync', 'changelog.json')

let memory: SyncStoreFile = { seq: 0, changes: [] }
let loaded = false

function load(): SyncStoreFile {
  if (loaded) return memory
  loaded = true
  const path = STORE_PATH()
  try {
    if (!existsSync(path)) {
      memory = { seq: 0, changes: [] }
      return memory
    }
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<SyncStoreFile>
    memory = {
      seq: typeof parsed.seq === 'number' ? parsed.seq : 0,
      changes: Array.isArray(parsed.changes) ? (parsed.changes as StoredChange[]) : [],
    }
  } catch (error) {
    logStructured('mobile-sync', 'warn', `changelog load failed: ${String(error)}`)
    memory = { seq: 0, changes: [] }
  }
  return memory
}

function persist(): void {
  const path = STORE_PATH()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(memory), 'utf8')
}

function upsertChange(change: SyncChange): void {
  const store = load()
  store.seq += 1
  const next: StoredChange = { ...change, seq: store.seq }
  const idx = store.changes.findIndex(
    (item) => item.entityKind === change.entityKind && item.entityId === change.entityId,
  )
  if (idx >= 0) {
    const prev = store.changes[idx]!
    if (prev.updatedAt > change.updatedAt) {
      // Keep newer local; still advance seq so pullers refresh cursor.
      store.changes[idx] = { ...prev, seq: store.seq }
    } else {
      store.changes[idx] = next
    }
  } else {
    store.changes.push(next)
  }
}

export function appendSyncChanges(changes: SyncChange[]): { accepted: number } {
  if (changes.length === 0) return { accepted: 0 }
  for (const change of changes) upsertChange(change)
  persist()
  return { accepted: changes.length }
}

export function pullSyncChanges(options: {
  cursor: string | null
  limit: number
}): { changes: SyncChange[]; nextCursor: string | null } {
  const store = load()
  const after = options.cursor ? Number.parseInt(options.cursor, 10) : 0
  const start = Number.isFinite(after) ? after : 0
  const slice = store.changes
    .filter((item) => item.seq > start)
    .sort((a, b) => a.seq - b.seq)
    .slice(0, options.limit)
  const nextSeq = slice.length > 0 ? slice[slice.length - 1]!.seq : start
  return {
    changes: slice.map(({ seq: _seq, ...change }) => change),
    nextCursor: String(Math.max(nextSeq, store.seq)),
  }
}

export function publishNoteSyncChange(note: {
  id: string
  title: string
  content: string
  updatedAt?: number
}): void {
  appendSyncChanges([
    {
      entityKind: 'note',
      entityId: note.id,
      op: 'upsert',
      updatedAt: note.updatedAt ?? Date.now(),
      payload: { title: note.title, body: note.content },
    },
  ])
}

export function publishNoteDeleteSyncChange(noteId: string, updatedAt = Date.now()): void {
  appendSyncChanges([
    {
      entityKind: 'note',
      entityId: noteId,
      op: 'delete',
      updatedAt,
      payload: {},
    },
  ])
}

export function publishKnowledgeMetaChanges(
  items: Array<{
    id: string
    name: string
    kind: string
    documentCount: number
    updatedAt?: number
  }>,
): void {
  const now = Date.now()
  appendSyncChanges(
    items.map((item) => ({
      entityKind: 'knowledge_meta' as const,
      entityId: item.id,
      op: 'upsert' as const,
      updatedAt: item.updatedAt ?? now,
      payload: {
        name: item.name,
        kind: item.kind,
        documentCount: item.documentCount,
      },
    })),
  )
}
