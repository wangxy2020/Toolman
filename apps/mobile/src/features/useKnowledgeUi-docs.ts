import type { Dispatch, SetStateAction } from 'react'
import type { KnowledgeSnapshot } from '@toolman/shared'
import type { MobileCreatedKb } from '../storage/createdKnowledgeBases'
import {
  DEFAULT_SYNC_FOLDER_ID,
  formatFileSize,
  isSystemDefaultFolderName,
  mobileSyncKbUiId,
  type KnowledgeFileItem,
} from './knowledgeSidebar'

export function seedDocsFromCreatedKbs(
  items: MobileCreatedKb[],
  prev: Record<string, KnowledgeFileItem[]>,
): Record<string, KnowledgeFileItem[]> {
  const next = { ...prev }
  for (const kb of items) {
    if (next[kb.id]) continue
    if (kb.kind === 'network' && kb.networkUrl) {
      next[kb.id] = [
        {
          id: `url-${kb.id}`,
          title: kb.networkUrl,
          sizeLabel: 'URL',
          addedAt: kb.updatedAt,
          status: 'ready',
          sourceKind: 'url',
          absolutePath: kb.networkUrl,
        },
      ]
    } else {
      next[kb.id] = []
    }
  }
  return next
}

export function mergeSnapshotDocuments(
  snapshot: KnowledgeSnapshot,
  prev: Record<string, KnowledgeFileItem[]>,
): Record<string, KnowledgeFileItem[]> {
  const defaultSyncKbIds = new Set(
    snapshot.kbs
      .filter((kb) => kb.kind === 'sync' && isSystemDefaultFolderName(kb.name))
      .map((kb) => kb.id),
  )
  const uiKbId = (kbId: string) => (defaultSyncKbIds.has(kbId) ? DEFAULT_SYNC_FOLDER_ID : kbId)
  const next: Record<string, KnowledgeFileItem[]> = {}
  for (const doc of snapshot.documents) {
    const file = snapshot.files.find(
      (item) => item.documentId === doc.id && item.kbId === doc.kbId,
    )
    const kbId = uiKbId(doc.kbId)
    const list = next[kbId] ?? []
    list.push({
      id: doc.id,
      title: doc.title,
      sizeLabel: formatFileSize(file?.sizeBytes ?? doc.sizeBytes ?? 0),
      addedAt: doc.updatedAt,
      status: doc.status === 'ready' ? 'ready' : 'pending',
      sourceKind: doc.sourceKind,
    })
    next[kbId] = list
  }
  const snapshotUiKbIds = new Set(snapshot.kbs.map((kb) => mobileSyncKbUiId(kb)))
  const staleIds = new Set([...snapshotUiKbIds, ...defaultSyncKbIds])
  const kept = Object.fromEntries(Object.entries(prev).filter(([id]) => !staleIds.has(id)))
  return { ...kept, ...next }
}

export function applyNetworkUrlDocs(
  prev: Record<string, KnowledgeFileItem[]>,
  id: string,
  nextUrl: string,
): Record<string, KnowledgeFileItem[]> {
  const docs = prev[id] ?? []
  const nextDocs =
    docs.length === 0
      ? [
          {
            id: `doc-${Date.now().toString(36)}`,
            title: nextUrl,
            sizeLabel: 'URL',
            addedAt: Date.now(),
            status: 'ready' as const,
            sourceKind: 'url' as const,
            absolutePath: nextUrl,
          },
        ]
      : docs.map((doc, index) =>
          index === 0 && doc.sourceKind === 'url'
            ? { ...doc, title: nextUrl, absolutePath: nextUrl }
            : doc,
        )
  return { ...prev, [id]: nextDocs }
}

export function buildDocumentOps(
  setDocumentsByKb: Dispatch<SetStateAction<Record<string, KnowledgeFileItem[]>>>,
  setImportError: (message: string | null) => void,
) {
  return {
    addDocuments: (kbId: string, items: KnowledgeFileItem[]) => {
      setDocumentsByKb((prev) => ({
        ...prev,
        [kbId]: [...items, ...(prev[kbId] ?? [])],
      }))
      setImportError(null)
    },
    deleteDocument: (kbId: string, docId: string) => {
      setDocumentsByKb((prev) => ({
        ...prev,
        [kbId]: (prev[kbId] ?? []).filter((item) => item.id !== docId),
      }))
    },
    reindexDocuments: (kbId: string, ids?: string[]) => {
      const match = (id: string) => !ids || ids.includes(id)
      setDocumentsByKb((prev) => ({
        ...prev,
        [kbId]: (prev[kbId] ?? []).map((item) =>
          match(item.id) ? { ...item, status: 'pending' } : item,
        ),
      }))
      setTimeout(() => {
        setDocumentsByKb((prev) => ({
          ...prev,
          [kbId]: (prev[kbId] ?? []).map((item) =>
            match(item.id) ? { ...item, status: 'ready' } : item,
          ),
        }))
      }, 800)
    },
    moveDocuments: (fromKbId: string, toKbId: string, ids: string[]) => {
      if (fromKbId === toKbId || ids.length === 0) return
      setDocumentsByKb((prev) => {
        const moving = (prev[fromKbId] ?? []).filter((item) => ids.includes(item.id))
        if (moving.length === 0) return prev
        return {
          ...prev,
          [fromKbId]: (prev[fromKbId] ?? []).filter((item) => !ids.includes(item.id)),
          [toKbId]: [...moving, ...(prev[toKbId] ?? [])],
        }
      })
    },
  }
}
