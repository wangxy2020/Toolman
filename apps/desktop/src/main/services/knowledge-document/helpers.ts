import {
  KnowledgeDocumentSchema,
  type KnowledgeDocument,
  isP2pSharedKnowledgeMirrorDescription,
} from '@toolman/shared'
import { isIgnoredKnowledgeIngestFile } from '@toolman/knowledge'
import type { KnowledgeBaseRow } from '@toolman/db'
import { deleteKnowledgeFolderFile, isPathInsideFolder } from '../knowledge-folder-files.service'
import { resolveKnowledgeBaseStoragePath } from '../knowledge-kb-storage-path.service'

export function parseErrorJson(value: string | null): string | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as { message?: string }
    return parsed.message ?? value
  } catch {
    return value
  }
}

function inferSourceKind(absolutePath: string | null | undefined): KnowledgeDocument['sourceKind'] {
  if (!absolutePath) return 'file'
  return absolutePath.startsWith('http://') || absolutePath.startsWith('https://') ? 'url' : 'file'
}

export function deleteManagedKnowledgeFileFromDisk(
  kb: KnowledgeBaseRow,
  absolutePath: string | null | undefined,
): void {
  if (!absolutePath || inferSourceKind(absolutePath) === 'url') return
  if (kb.kind === 'network' || isP2pSharedKnowledgeMirrorDescription(kb.description)) {
    return
  }

  const storagePath = resolveKnowledgeBaseStoragePath(kb, { ensure: false })
  if (!storagePath || !isPathInsideFolder(storagePath, absolutePath)) return

  deleteKnowledgeFolderFile({
    folderPath: storagePath,
    filePath: absolutePath,
  })
}

export function toDocument(
  row: {
    id: string
    kbId: string
    title: string
    contentHash: string | null
    mimeType: string | null
    status: KnowledgeDocument['status']
    absolutePath: string | null
    errorJson: string | null
    createdAt: Date
    updatedAt: Date
  },
  chunkCount: number,
  sizeBytes?: number | null,
): KnowledgeDocument {
  return KnowledgeDocumentSchema.parse({
    id: row.id,
    kbId: row.kbId,
    title: row.title,
    contentHash: row.contentHash,
    mimeType: row.mimeType,
    status: row.status,
    absolutePath: row.absolutePath,
    sourceKind: inferSourceKind(row.absolutePath),
    chunkCount,
    sizeBytes: sizeBytes ?? null,
    // Only surface errors for failed docs — stale cancel text must not appear under "排队中".
    errorMessage: row.status === 'failed' ? parseErrorJson(row.errorJson) : null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  })
}

export function isIgnoredKnowledgeDocument(row: {
  absolutePath: string | null
  title: string
}): boolean {
  if (row.absolutePath && isIgnoredKnowledgeIngestFile(row.absolutePath)) return true
  return isIgnoredKnowledgeIngestFile(row.title)
}

