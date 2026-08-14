import { Platform } from 'react-native'
import {
  KnowledgeSnapshotSchema,
  type KnowledgeSnapshot,
} from '@toolman/shared'

const IDB_NAME = 'toolman-mobile'
const IDB_STORE = 'kv'
const IDB_KEY = 'knowledge-snapshot-v1'

let memorySnapshot: KnowledgeSnapshot | null = null

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined'
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'))
  })
}

async function idbGet(key: string): Promise<unknown> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    const req = tx.objectStore(IDB_STORE).get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('indexedDB get failed'))
  })
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const req = tx.objectStore(IDB_STORE).put(value, key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error ?? new Error('indexedDB put failed'))
  })
}

export async function loadKnowledgeSnapshot(): Promise<KnowledgeSnapshot | null> {
  if (memorySnapshot) return memorySnapshot
  if (!hasIndexedDb()) return null
  try {
    const raw = await idbGet(IDB_KEY)
    if (!raw) return null
    const parsed = KnowledgeSnapshotSchema.parse(raw)
    memorySnapshot = parsed
    return parsed
  } catch {
    return null
  }
}

export async function saveKnowledgeSnapshot(snapshot: KnowledgeSnapshot): Promise<void> {
  memorySnapshot = snapshot
  if (!hasIndexedDb()) return
  try {
    await idbSet(IDB_KEY, snapshot)
  } catch {
    // Quota / private mode: keep in-memory copy for this session.
    if (Platform.OS !== 'web') return
  }
}
