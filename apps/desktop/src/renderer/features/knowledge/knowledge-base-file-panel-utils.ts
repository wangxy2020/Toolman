import { IpcChannel, type KnowledgeDocument } from '@toolman/shared'
import type { KnowledgeFilePanelItem } from './knowledge-base-file-panel-types'

export function knowledgeDocumentToPanelItem(doc: KnowledgeDocument): KnowledgeFilePanelItem {
  return {
    id: doc.id,
    title: doc.title,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    sizeBytes: doc.sizeBytes,
    mimeType: doc.mimeType,
    status: doc.status,
    chunkCount: doc.chunkCount,
    errorMessage: doc.errorMessage,
    absolutePath: doc.absolutePath,
    sourceKind: doc.sourceKind,
  }
}

export function openExternalUrl(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

export async function openLocalFile(path: string, onError?: (message: string) => void) {
  const result = await window.api.invoke(IpcChannel.AppShellOpenPath, { path })
  if (!result.ok) {
    onError?.(result.error.message)
  }
}

export function isOpenableLocalPath(path: string | null | undefined): path is string {
  if (!path) return false
  return !/^https?:\/\//i.test(path)
}

export function extractDroppedUrl(dataTransfer: DataTransfer): string | null {
  const uriList = dataTransfer.getData('text/uri-list').trim()
  if (uriList) {
    const firstLine = uriList.split('\n').find((line) => line.trim() && !line.startsWith('#'))
    if (firstLine) return firstLine.trim()
  }

  const plain = dataTransfer.getData('text/plain').trim()
  if (/^https?:\/\//i.test(plain)) return plain
  return null
}
