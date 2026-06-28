import { copyFileSync, existsSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { P2pWorkspaceRepository } from '@toolman/db'
import type { WorkspaceEvent } from '@toolman/shared'
import {
  isP2pSharedKnowledgeMirrorDescription,
  P2pKnowledgeEnsureDocumentSavedInputSchema,
  P2pKnowledgeMaterializeDocumentInputSchema,
  P2pKnowledgeSyncDocumentInputSchema,
} from '@toolman/shared'
import {
  buildP2pGroupSavedKnowledgeDescription,
  buildP2pGroupSavedKnowledgeDisplayName,
  findGroupSavedKnowledgeBaseId,
  normalizeP2pGroupSavedKnowledgeMeta,
  parseP2pGroupSavedKnowledgeMeta,
} from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../../db/repos'
import { writeBlobFromPath } from '../blob.service'
import { appendP2pEvent } from './p2p-event.service'
import { findLatestKnowledgeDocumentContentEvent } from './p2p-knowledge-share-metadata'
import { syncMissingSharedKnowledgeDocuments } from './p2p-knowledge-projection'
import { fetchAndCacheSharedKnowledgeBlob, ensureP2pKnowledgeBlobCached } from './p2p-knowledge-blob-cache.service'
import { pushBlobToPeers } from './p2p-blob-transfer.service'
import { stripGroupPrefixedName, resolvePersonalStorageWorkspaceId } from './p2p-group-resource-naming'
import { getSharedResourceRepo } from './knowledge-sync-shared-resource'
import {
  assertCanEditSharedResource,
  assertWorkspaceMemberAccess,
  getActiveWorkspaceMember,
} from './p2p-permission.guard'
import { getDefaultWorkspace } from '../workspace.service'
import { ingestFileAtPath, refreshKbStats } from '../knowledge-ingest.service'
import { resolveKnowledgeBaseStoragePath } from '../knowledge-kb-storage-path.service'
import { ensureKnowledgeBaseStorageSource } from '../knowledge-kb-storage-source.service'
import { restartKnowledgeWatchersForKb } from '../knowledge-watcher.service'

const docSyncInFlight = new Map<string, Promise<{ event: WorkspaceEvent }>>()

export function resetKnowledgeDocumentSyncInFlightForTests(): void {
  docSyncInFlight.clear()
}

export async function syncP2pKnowledgeDocument(rawInput: unknown): Promise<{ event: WorkspaceEvent }> {
  const input = P2pKnowledgeSyncDocumentInputSchema.parse(rawInput)
  const key = `${input.workspaceId}:${input.knowledgeBaseId}:${input.documentId}`
  const existing = docSyncInFlight.get(key)
  if (existing) return existing

  const job = syncP2pKnowledgeDocumentImpl(input).finally(() => {
    docSyncInFlight.delete(key)
  })
  docSyncInFlight.set(key, job)
  return job
}

async function syncP2pKnowledgeDocumentImpl(
  input: ReturnType<typeof P2pKnowledgeSyncDocumentInputSchema.parse>,
): Promise<{ event: WorkspaceEvent }> {
  const member = assertWorkspaceMemberAccess(input.workspaceId)
  const docRepo = getDocumentRepository()
  const doc = docRepo.findById(input.documentId, input.knowledgeBaseId)
  if (!doc || doc.status !== 'ready') {
    throw new Error('文档未就绪，无法同步')
  }
  if (!doc.absolutePath || !existsSync(doc.absolutePath)) {
    throw new Error('文档文件不存在')
  }

  const shared = getSharedResourceRepo().findByWorkspaceAndLocalResource(
    input.workspaceId,
    input.knowledgeBaseId,
    'Knowledge',
  )
  if (!shared || shared.status !== 'active') {
    throw new Error('知识库尚未共享到群组')
  }
  assertCanEditSharedResource(member, {
    permission: shared.permission,
    sharedBy: shared.sharedBy,
  })

  const blob = writeBlobFromPath(doc.absolutePath)
  const stat = statSync(doc.absolutePath)

  const event = await appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'Knowledge',
    resourceId: input.documentId,
    operatorId: member.id,
    eventType: 'Updated',
    payload: {
      kb_id: input.knowledgeBaseId,
      doc_id: input.documentId,
      title: doc.title,
      content_hash: blob.hash,
      mime_type: blob.mimeType,
      size_bytes: stat.size,
    },
  })

  getSharedResourceRepo().update({
    id: shared.id,
    contentHash: blob.hash,
    version: (shared.version ?? 1) + 1,
  })

  docRepo.update(input.documentId, input.knowledgeBaseId, {
    blobHash: blob.hash,
    contentHash: blob.hash,
  })

  await pushBlobToPeers(input.workspaceId, blob.hash, blob.mimeType)

  return { event }
}

function sanitizeKnowledgeDocumentFileName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '文档'
  return trimmed.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim()
}

function ensureUserSavedGroupKnowledgeBase(
  storageWorkspaceId: string,
  p2pWorkspaceId: string,
  groupName: string,
  sharedFolderName: string,
): { kbId: string; storagePath: string } {
  const kbRepo = getKnowledgeBaseRepository()
  const savedMeta = normalizeP2pGroupSavedKnowledgeMeta(
    groupName,
    sharedFolderName,
    p2pWorkspaceId,
  )
  const displayName = buildP2pGroupSavedKnowledgeDisplayName(
    savedMeta.groupName,
    savedMeta.sharedFolderName,
  )
  const description = buildP2pGroupSavedKnowledgeDescription(savedMeta)

  const workspaceRows = kbRepo.listByWorkspace(storageWorkspaceId)
  const existingId = findGroupSavedKnowledgeBaseId(
    workspaceRows,
    {
      p2pWorkspaceId,
      groupName,
      sharedFolderName,
    },
    { isMirrorDescription: isP2pSharedKnowledgeMirrorDescription },
  )

  let kbRow = existingId ? kbRepo.findRowById(existingId, storageWorkspaceId) : null
  if (kbRow && !parseP2pGroupSavedKnowledgeMeta(kbRow.description)?.p2pWorkspaceId) {
    kbRepo.update({
      id: kbRow.id,
      workspaceId: storageWorkspaceId,
      name: displayName,
      description,
    })
    kbRow = kbRepo.findRowById(kbRow.id, storageWorkspaceId) ?? kbRow
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

async function resolveSharedKnowledgeDocumentContent(input: {
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

async function ensureSharedKnowledgeBlobCached(input: {
  workspaceId: string
  storageWorkspaceId: string
  sourceKbId: string
  documentId: string
  title: string
  contentHash: string
  mimeType: string
  sharedBy: string
}): Promise<string | null> {
  return fetchAndCacheSharedKnowledgeBlob({
    p2pWorkspaceId: input.workspaceId,
    storageWorkspaceId: input.storageWorkspaceId,
    kbId: input.sourceKbId,
    docId: input.documentId,
    title: input.title,
    contentHash: input.contentHash,
    mimeType: input.mimeType,
    sharedBy: input.sharedBy,
  })
}

async function ensureSharedKnowledgeBlobCachedWithRetry(input: {
  workspaceId: string
  storageWorkspaceId: string
  sourceKbId: string
  documentId: string
  title: string
  contentHash: string
  mimeType: string
  sharedBy: string
}): Promise<string | null> {
  let cachedPath = await ensureSharedKnowledgeBlobCached(input)
  if (cachedPath) {
    return cachedPath
  }

  await syncMissingSharedKnowledgeDocuments(input.workspaceId)
  cachedPath = await ensureSharedKnowledgeBlobCached(input)
  if (cachedPath) {
    return cachedPath
  }

  return ensureP2pKnowledgeBlobCached({
    p2pWorkspaceId: input.workspaceId,
    storageWorkspaceId: input.storageWorkspaceId,
    kbId: input.sourceKbId,
    docId: input.documentId,
    title: input.title,
    contentHash: input.contentHash,
    mimeType: input.mimeType,
    sharedBy: input.sharedBy,
  })
}

export async function materializeP2pKnowledgeDocumentForOpen(rawInput: unknown): Promise<{
  absolutePath: string
}> {
  const input = P2pKnowledgeMaterializeDocumentInputSchema.parse(rawInput)
  const content = await resolveSharedKnowledgeDocumentContent(input)
  const storageWorkspaceId =
    resolvePersonalStorageWorkspaceId() ?? getDefaultWorkspace()?.id
  if (!storageWorkspaceId) {
    throw new Error('工作区未就绪')
  }

  const cachedPath = await ensureSharedKnowledgeBlobCachedWithRetry({
    workspaceId: input.workspaceId,
    storageWorkspaceId,
    sourceKbId: content.sourceKbId,
    documentId: input.documentId,
    title: content.title,
    contentHash: content.contentHash,
    mimeType: content.mimeType,
    sharedBy: content.sharedBy,
  })
  if (!cachedPath) {
    throw new Error('文档内容尚未同步到群组，请稍后重试')
  }

  return { absolutePath: cachedPath }
}

export async function ensureP2pKnowledgeDocumentSaved(rawInput: unknown): Promise<{
  absolutePath: string
  savedDocumentId: string
}> {
  const input = P2pKnowledgeEnsureDocumentSavedInputSchema.parse(rawInput)
  const content = await resolveSharedKnowledgeDocumentContent(input)
  const storageWorkspaceId =
    resolvePersonalStorageWorkspaceId() ?? getDefaultWorkspace()?.id
  if (!storageWorkspaceId) {
    throw new Error('工作区未就绪')
  }

  const cachedPath = await ensureSharedKnowledgeBlobCachedWithRetry({
    workspaceId: input.workspaceId,
    storageWorkspaceId,
    sourceKbId: content.sourceKbId,
    documentId: input.documentId,
    title: content.title,
    contentHash: content.contentHash,
    mimeType: content.mimeType,
    sharedBy: content.sharedBy,
  })
  if (!cachedPath) {
    throw new Error('文档内容尚未从群主同步，请确认 P2P 已连接后重试')
  }

  const p2pWorkspace = new P2pWorkspaceRepository(getDatabase()).findById(input.workspaceId)
  if (!p2pWorkspace) {
    throw new Error('群组不存在')
  }

  const member = getActiveWorkspaceMember(input.workspaceId)
  if (content.sharedBy === member.id) {
    throw new Error('自己的共享文件请保存在本地知识库，不会写入共享知识库')
  }

  const { kbId, storagePath } = ensureUserSavedGroupKnowledgeBase(
    storageWorkspaceId,
    input.workspaceId,
    p2pWorkspace.name,
    content.sharedFolderName,
  )

  const fileExt = extname(cachedPath) || extname(content.title)
  const titledName = sanitizeKnowledgeDocumentFileName(
    content.title.replace(/\.[^./\\]+$/i, '') || content.title,
  )
  const fileName =
    fileExt && !titledName.toLowerCase().endsWith(fileExt.toLowerCase())
      ? `${titledName}${fileExt}`
      : titledName
  const destinationPath = join(storagePath, fileName)

  if (!existsSync(destinationPath)) {
    copyFileSync(cachedPath, destinationPath)
  }

  const result = await ingestFileAtPath({
    workspaceId: storageWorkspaceId,
    kbId,
    filePath: destinationPath,
    skipP2pSync: true,
  })
  if (result.outcome === 'failed') {
    throw new Error(result.message ?? '保存文档失败')
  }

  refreshKbStats(storageWorkspaceId, kbId)

  const savedDoc = getDocumentRepository().findByPath(kbId, destinationPath)
  if (!savedDoc) {
    throw new Error('保存文档失败')
  }

  return { absolutePath: destinationPath, savedDocumentId: savedDoc.id }
}
