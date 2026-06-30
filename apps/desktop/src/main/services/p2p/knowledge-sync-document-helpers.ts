import type { WorkspaceEvent } from '@toolman/shared'
import { stripGroupPrefixedName } from './p2p-group-resource-naming'
import {
  buildP2pGroupSavedKnowledgeDescription,
  buildP2pGroupSavedKnowledgeDisplayName,
  findGroupSavedKnowledgeBaseId,
  isP2pSharedKnowledgeMirrorDescription,
  normalizeP2pGroupSavedKnowledgeMeta,
  parseP2pGroupSavedKnowledgeMeta,
} from '@toolman/shared'
import { getKnowledgeBaseRepository } from '../../db/repos'
import { findLatestKnowledgeDocumentContentEvent } from './p2p-knowledge-share-metadata'
import { syncMissingSharedKnowledgeDocuments } from './p2p-knowledge-projection'
import {
  fetchAndCacheSharedKnowledgeBlob,
  ensureP2pKnowledgeBlobCached,
} from './p2p-knowledge-blob-cache.service'
import { getSharedResourceRepo } from './knowledge-sync-shared-resource'
import { assertWorkspaceMemberAccess } from './p2p-permission.guard'
import { resolveKnowledgeBaseStoragePath } from '../knowledge-kb-storage-path.service'
import { ensureKnowledgeBaseStorageSource } from '../knowledge-kb-storage-source.service'
import { restartKnowledgeWatchersForKb } from '../knowledge-watcher.service'
import { ensureWorkspaceSharedKnowledgeFolder } from '../knowledge-folder.service'
import {
  migrateDocumentsInKbToStoragePath,
  moveRootLevelFiles,
  removeEmptyDirectory,
} from './p2p-group-saved-knowledge-migration-fs'
import { collectLegacyStoragePaths } from './p2p-group-saved-knowledge-migration-recover'

export function sanitizeKnowledgeDocumentFileName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '文档'
  return trimmed.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim()
}

export function ensureUserSavedGroupKnowledgeBase(
  storageWorkspaceId: string,
  p2pWorkspaceId: string,
  groupName: string,
  _sharedFolderName?: string,
): { kbId: string; storagePath: string } {
  const kbRepo = getKnowledgeBaseRepository()
  const savedMeta = normalizeP2pGroupSavedKnowledgeMeta(groupName, undefined, p2pWorkspaceId)
  const displayName = buildP2pGroupSavedKnowledgeDisplayName(savedMeta.groupName)
  const description = buildP2pGroupSavedKnowledgeDescription(savedMeta)

  const workspaceRows = kbRepo.listByWorkspace(storageWorkspaceId)
  const existingId = findGroupSavedKnowledgeBaseId(
    workspaceRows,
    {
      p2pWorkspaceId,
      groupName,
    },
    { isMirrorDescription: isP2pSharedKnowledgeMirrorDescription },
  )

  let kbRow = existingId ? kbRepo.findRowById(existingId, storageWorkspaceId) : null
  if (kbRow) {
    const sharedRoot = ensureWorkspaceSharedKnowledgeFolder({ workspaceId: storageWorkspaceId })
    const legacyMeta = parseP2pGroupSavedKnowledgeMeta(kbRow.description)
    const canonicalDescription = buildP2pGroupSavedKnowledgeDescription(savedMeta)
    const needsMetaUpdate =
      kbRow.name !== displayName ||
      kbRow.description !== canonicalDescription ||
      legacyMeta?.sharedFolderName != null ||
      !legacyMeta?.p2pWorkspaceId

    if (needsMetaUpdate) {
      kbRepo.update({
        id: kbRow.id,
        workspaceId: storageWorkspaceId,
        name: displayName,
        description: canonicalDescription,
      })
      kbRow = kbRepo.findRowById(kbRow.id, storageWorkspaceId) ?? kbRow
    }

    const targetStoragePath = resolveKnowledgeBaseStoragePath(
      {
        workspaceId: storageWorkspaceId,
        name: kbRow.name,
        kind: kbRow.kind,
        description: kbRow.description ?? canonicalDescription,
      },
      { ensure: true },
    )
    if (targetStoragePath && legacyMeta) {
      for (const legacyPath of collectLegacyStoragePaths(sharedRoot, kbRow.name, legacyMeta)) {
        if (legacyPath === targetStoragePath) continue
        moveRootLevelFiles(legacyPath, targetStoragePath)
        removeEmptyDirectory(legacyPath)
      }
      migrateDocumentsInKbToStoragePath(kbRow.id, storageWorkspaceId, targetStoragePath)
    }
  }

  kbRow =
    kbRow ??
    kbRepo.create({
      workspaceId: storageWorkspaceId,
      name: displayName,
      kind: 'shared',
      description,
    })

  const kbForPath = {
    workspaceId: storageWorkspaceId,
    name: kbRow.name,
    kind: kbRow.kind,
    description: kbRow.description ?? description,
  }
  const storagePath = resolveKnowledgeBaseStoragePath(kbForPath, { ensure: true })
  if (!storagePath) {
    throw new Error('无法创建共享知识库文件夹')
  }

  ensureKnowledgeBaseStorageSource(storageWorkspaceId, kbRow.id, storagePath)
  restartKnowledgeWatchersForKb(storageWorkspaceId, kbRow.id)

  return { kbId: kbRow.id, storagePath }
}

export async function resolveSharedKnowledgeDocumentContent(input: {
  workspaceId: string
  resourceId: string
  documentId: string
}): Promise<{
  sourceKbId: string
  title: string
  contentHash: string
  mimeType: string
  sharedBy: string
  sharedFolderName: string
  contentEvent: WorkspaceEvent
}> {
  const sharedRepo = getSharedResourceRepo()
  const resource = sharedRepo.findById(input.resourceId)
  if (!resource || resource.workspaceId !== input.workspaceId) {
    throw new Error('共享资源不存在')
  }
  if (resource.resourceType !== 'Knowledge' || resource.status !== 'active') {
    throw new Error('共享资源不存在')
  }

  assertWorkspaceMemberAccess(input.workspaceId)

  const sourceKbId = resource.localResourceId ?? resource.id
  const contentEvent = findLatestKnowledgeDocumentContentEvent(
    input.workspaceId,
    sourceKbId,
    input.documentId,
  )
  if (!contentEvent) {
    throw new Error('文档内容尚未同步到群组，请稍后重试')
  }

  const title =
    typeof contentEvent.payload?.title === 'string'
      ? contentEvent.payload.title.trim() || '文档'
      : '文档'
  const contentHash =
    typeof contentEvent.payload?.content_hash === 'string'
      ? contentEvent.payload.content_hash
      : ''
  const mimeType =
    typeof contentEvent.payload?.mime_type === 'string'
      ? contentEvent.payload.mime_type
      : 'application/octet-stream'

  if (!contentHash) {
    throw new Error('文档内容尚未同步到群组，请稍后重试')
  }

  return {
    sourceKbId,
    title,
    contentHash,
    mimeType,
    sharedBy: resource.sharedBy,
    sharedFolderName: stripGroupPrefixedName(input.workspaceId, resource.name),
    contentEvent,
  }
}

export async function ensureSharedKnowledgeBlobCachedWithRetry(input: {
  workspaceId: string
  storageWorkspaceId: string
  sourceKbId: string
  documentId: string
  title: string
  contentHash: string
  mimeType: string
  sharedBy: string
}): Promise<string | null> {
  const fetchInput = {
    p2pWorkspaceId: input.workspaceId,
    storageWorkspaceId: input.storageWorkspaceId,
    kbId: input.sourceKbId,
    docId: input.documentId,
    title: input.title,
    contentHash: input.contentHash,
    mimeType: input.mimeType,
    sharedBy: input.sharedBy,
  }

  let cachedPath = await fetchAndCacheSharedKnowledgeBlob(fetchInput)
  if (cachedPath) {
    return cachedPath
  }

  await syncMissingSharedKnowledgeDocuments(input.workspaceId)
  cachedPath = await fetchAndCacheSharedKnowledgeBlob(fetchInput)
  if (cachedPath) {
    return cachedPath
  }

  return ensureP2pKnowledgeBlobCached(fetchInput)
}
