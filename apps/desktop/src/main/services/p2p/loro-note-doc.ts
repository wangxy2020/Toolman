import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { LoroDoc, type VersionVector } from 'loro-crdt'

export const LORO_NOTE_TEXT_KEY = 'content'

const docCache = new Map<string, LoroDoc>()
const versionCache = new Map<string, VersionVector>()
const MAX_LORO_DOC_CACHE = 32

function touchLoroDocCache(key: string, doc: LoroDoc): LoroDoc {
  if (docCache.has(key)) {
    docCache.delete(key)
  }
  docCache.set(key, doc)
  while (docCache.size > MAX_LORO_DOC_CACHE) {
    const oldest = docCache.keys().next().value
    if (!oldest) break
    docCache.delete(oldest)
    versionCache.delete(oldest)
  }
  return doc
}

function docKey(workspaceId: string, noteId: string): string {
  return `${workspaceId}:${noteId}`
}

export function getP2pNotesDir(workspaceId: string): string {
  return join(app.getPath('userData'), 'p2p-workspaces', workspaceId, 'notes')
}

function loroSnapshotPath(workspaceId: string, noteId: string): string {
  return join(getP2pNotesDir(workspaceId), `${noteId}.loro`)
}

export function getTextFromLoroDoc(doc: LoroDoc): string {
  return doc.getText(LORO_NOTE_TEXT_KEY).toString()
}

export function setLoroDocText(doc: LoroDoc, text: string): void {
  const container = doc.getText(LORO_NOTE_TEXT_KEY)
  const current = container.toString()
  if (current === text) return
  if (current.length > 0) {
    container.delete(0, current.length)
  }
  if (text.length > 0) {
    container.insert(0, text)
  }
}

export function createLoroDocFromText(text: string): LoroDoc {
  const doc = new LoroDoc()
  if (text.length > 0) {
    doc.getText(LORO_NOTE_TEXT_KEY).insert(0, text)
  }
  return doc
}

export function exportLoroOplogBase64(doc: LoroDoc, from?: VersionVector): string {
  const bytes = from
    ? doc.export({ mode: 'update', from })
    : doc.export({ mode: 'update' })
  return Buffer.from(bytes).toString('base64')
}

export function importLoroOplogBase64(doc: LoroDoc, base64: string): void {
  const bytes = Buffer.from(base64, 'base64')
  if (bytes.length === 0) return
  doc.import(bytes)
}

export function getLoroDoc(workspaceId: string, noteId: string): LoroDoc {
  const key = docKey(workspaceId, noteId)
  const cached = docCache.get(key)
  if (cached) return touchLoroDocCache(key, cached)

  const doc = new LoroDoc()
  const path = loroSnapshotPath(workspaceId, noteId)
  if (existsSync(path)) {
    doc.import(readFileSync(path))
  }

  docCache.set(key, doc)
  versionCache.set(key, doc.version())
  return touchLoroDocCache(key, doc)
}

export function initLoroDocFromText(workspaceId: string, noteId: string, text: string): LoroDoc {
  const doc = createLoroDocFromText(text)
  const key = docKey(workspaceId, noteId)
  versionCache.set(key, doc.version())
  persistLoroDoc(workspaceId, noteId, doc)
  return touchLoroDocCache(key, doc)
}

export function exportPendingLoroOplog(
  workspaceId: string,
  noteId: string,
): string | null {
  const key = docKey(workspaceId, noteId)
  const doc = docCache.get(key)
  if (!doc) return null

  const from = versionCache.get(key)
  const bytes = from ? doc.export({ mode: 'update', from }) : doc.export({ mode: 'update' })
  if (bytes.length === 0) return null

  versionCache.set(key, doc.version())
  return Buffer.from(bytes).toString('base64')
}

export function persistLoroDoc(workspaceId: string, noteId: string, doc: LoroDoc): void {
  const path = loroSnapshotPath(workspaceId, noteId)
  const dir = dirname(path)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(path, Buffer.from(doc.export({ mode: 'snapshot' })))
}

export function applyLoroOplog(
  workspaceId: string,
  noteId: string,
  oplogBase64: string,
): LoroDoc {
  const doc = getLoroDoc(workspaceId, noteId)
  importLoroOplogBase64(doc, oplogBase64)
  versionCache.set(docKey(workspaceId, noteId), doc.version())
  persistLoroDoc(workspaceId, noteId, doc)
  return doc
}

export function clearLoroDocCache(workspaceId: string, noteId: string): void {
  const key = docKey(workspaceId, noteId)
  docCache.delete(key)
  versionCache.delete(key)
}
