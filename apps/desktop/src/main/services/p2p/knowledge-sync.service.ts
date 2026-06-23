import { copyFileSync, existsSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { P2pSharedResourceRepository, P2pWorkspaceRepository, type KnowledgeBaseRow, type P2pSharedResourceRow } from '@toolman/db'
import type { P2pSharedResource, P2pKnowledgeDocumentPermission, WorkspaceEvent } from '@toolman/shared'
import { isP2pSharedKnowledgeMirrorDescription } from '@toolman/shared'
import {
  buildP2pGroupSavedKnowledgeDescription,
  buildP2pGroupSavedKnowledgeDisplayName,
  findGroupSavedKnowledgeBaseId,
  normalizeP2pGroupSavedKnowledgeMeta,
  parseP2pGroupSavedKnowledgeMeta,
  P2pKnowledgeEnsureDocumentSavedInputSchema,
  P2pKnowledgeMaterializeDocumentInputSchema,
  P2pKnowledgeRemoveDocumentsInputSchema,
  P2pKnowledgeSetDocumentPermissionInputSchema,
  P2pKnowledgeShareInputSchema,
  P2pKnowledgeSyncDocumentInputSchema,
  P2pResourceListInputSchema,
  P2pResourceUnshareInputSchema,
} from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../../db/repos'
import { writeBlobFromPath } from '../blob.service'
import { mapP2pAgentSharedResourceRow } from './agent-share.service'
import { appendP2pEvent } from './p2p-event.service'
import { protectOwnerSourceKnowledgeBase } from './p2p-knowledge-projection'
import { findLatestKnowledgeDocumentContentEvent } from './p2p-knowledge-share-metadata'
import { ensureP2pKnowledgeBlobCached } from './p2p-knowledge-blob-cache.service'
import { pushBlobToPeers } from './p2p-blob-transfer.service'
import {
  findSharedResourceInWorkspace,
  resolveSharedResourceId,
} from './p2p-shared-resource-id'
import { syncMissingSharedKnowledgeDocuments } from './p2p-knowledge-projection'
import {
  assertCanEditSharedResource,
  assertCanManageSharedResource,
  assertCanShareResource,
  assertWorkspaceMemberAccess,
} from './p2p-permission.guard'
import { getDefaultWorkspace } from '../workspace.service'
import { stripGroupPrefixedName, resolvePersonalStorageWorkspaceId } from './p2p-group-resource-naming'
import { ingestFileAtPath } from '../knowledge-ingest.service'
import { resolveKnowledgeBaseStoragePath } from '../knowledge-kb-storage-path.service'
import { ensureKnowledgeBaseStorageSource } from '../knowledge-kb-storage-source.service'
import { restartKnowledgeWatchersForKb } from '../knowledge-watcher.service'

function getSharedResourceRepo(): P2pSharedResourceRepository {
  return new P2pSharedResourceRepository(getDatabase())
}

interface KnowledgeShareMetadata {
  description?: string | null
  sourceWorkspaceId?: string
  documentIds?: string[]
  documentPermissions?: Record<string, P2pKnowledgeDocumentPermission>
}

export { parseKnowledgeDocumentPermissionsFromPayload } from './p2p-knowledge-share-metadata'

function readKnowledgeShareMetadata(metadataJson: string): KnowledgeShareMetadata {
  try {
    const parsed = JSON.parse(metadataJson) as KnowledgeShareMetadata & {
      documentPermissions?: Record<string, unknown>
    }
    const documentPermissions: Record<string, P2pKnowledgeDocumentPermission> = {}
    if (parsed.documentPermissions && typeof parsed.documentPermissions === 'object') {
      for (const [documentId, permission] of Object.entries(parsed.documentPermissions)) {
        if (permission === 'read' || permission === 'savable') {
          documentPermissions[documentId] = permission
        }
      }
    }
    return {
      description: parsed.description ?? null,
      sourceWorkspaceId:
        typeof parsed.sourceWorkspaceId === 'string' ? parsed.sourceWorkspaceId : undefined,
      documentIds: Array.isArray(parsed.documentIds)
        ? parsed.documentIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : undefined,
      documentPermissions:
        Object.keys(documentPermissions).length > 0 ? documentPermissions : undefined,
    }
  } catch {
    return {}
  }
}

function buildKnowledgeShareMetadata(parts: KnowledgeShareMetadata): string {
  const payload: KnowledgeShareMetadata = {
    description: parts.description ?? null,
    sourceWorkspaceId: parts.sourceWorkspaceId,
  }
  if (parts.documentIds && parts.documentIds.length > 0) {
    payload.documentIds = parts.documentIds
  }
  if (parts.documentPermissions && Object.keys(parts.documentPermissions).length > 0) {
    payload.documentPermissions = parts.documentPermissions
  }
  return JSON.stringify(payload)
}

function mergeSharedDocumentIds(
  existing: string[] | undefined,
  incoming: string[] | undefined,
): string[] | undefined {
  if (!incoming || incoming.length === 0) {
    return existing
  }
  return [...new Set([...(existing ?? []), ...incoming])]
}

function mapSharedResourceRow(row: P2pSharedResourceRow): P2pSharedResource {
  if (row.resourceType === 'Agent') {
    return mapP2pAgentSharedResourceRow(row)
  }

  const base: P2pSharedResource = {
    id: row.id,
    workspaceId: row.workspaceId,
    resourceType: row.resourceType,
    localResourceId: row.localResourceId,
    name: row.name,
    sharedBy: row.sharedBy,
    permission: row.permission,
    contentHash: row.contentHash,
    version: row.version ?? 1,
    status: row.status,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }

  if (row.resourceType !== 'Knowledge') {
    return base
  }

  const metadata = readKnowledgeShareMetadata(row.metadataJson)
  return {
    ...base,
    sharedDocumentIds: metadata.documentIds,
    sharedDocumentPermissions: metadata.documentPermissions,
    sourceWorkspaceId: metadata.sourceWorkspaceId,
  }
}

function ensureKnowledgeBaseMirrored(
  _p2pWorkspaceId: string,
  _sourceKb: KnowledgeBaseRow,
): void {
  // Knowledge bases live in the personal workspace; P2P tracks shared resources only.
}

export async function shareP2pKnowledge(rawInput: unknown): Promise<{ sharedResource: P2pSharedResource }> {
  const input = P2pKnowledgeShareInputSchema.parse(rawInput)
  const member = assertCanShareResource(input.workspaceId)
  const sourceWorkspaceId = input.sourceWorkspaceId ?? getDefaultWorkspace()?.id
  if (!sourceWorkspaceId) {
    throw new Error('工作区未就绪')
  }
  const kb = getKnowledgeBaseRepository().findRowById(input.knowledgeBaseId, sourceWorkspaceId)
  if (!kb) {
    throw new Error('知识库不存在')
  }

  protectOwnerSourceKnowledgeBase(
    input.workspaceId,
    kb.id,
    sourceWorkspaceId,
    stripGroupPrefixedName(input.workspaceId, kb.name),
  )

  if (sourceWorkspaceId !== input.workspaceId) {
    ensureKnowledgeBaseMirrored(input.workspaceId, kb)
  }

  const sharedRepo = getSharedResourceRepo()
  let resource = findSharedResourceInWorkspace(
    sharedRepo,
    input.workspaceId,
    kb.id,
    'Knowledge',
  )

  const shareDisplayName = stripGroupPrefixedName(input.workspaceId, kb.name)
  const existingMetadata = resource ? readKnowledgeShareMetadata(resource.metadataJson) : {}
  const shareWholeKnowledgeBase = !input.documentIds || input.documentIds.length === 0
  const sharedDocumentIds = shareWholeKnowledgeBase
    ? undefined
    : mergeSharedDocumentIds(existingMetadata.documentIds, input.documentIds)
  const metadataJson = buildKnowledgeShareMetadata({
    description: kb.description,
    sourceWorkspaceId,
    documentIds: sharedDocumentIds,
    documentPermissions: existingMetadata.documentPermissions,
  })

  const docRepo = getDocumentRepository()
  const docs = docRepo
    .listByKb(kb.id)
    .filter((doc) => doc.status === 'ready' && doc.absolutePath)
  const docsToSync =
    input.documentIds && input.documentIds.length > 0
      ? docs.filter((doc) => input.documentIds!.includes(doc.id))
      : shareWholeKnowledgeBase
        ? docs
        : []

  if (!resource) {
    resource = sharedRepo.create({
      id: resolveSharedResourceId(sharedRepo, kb.id, input.workspaceId),
      workspaceId: input.workspaceId,
      resourceType: 'Knowledge',
      localResourceId: kb.id,
      name: shareDisplayName,
      sharedBy: member.id,
      permission: input.permission ?? 'read',
      metadataJson,
    })
  } else if (resource.status !== 'active') {
    resource =
      sharedRepo.update({
        id: resource.id,
        name: shareDisplayName,
        status: 'active',
        metadataJson,
      }) ?? resource
  } else {
    resource =
      sharedRepo.update({
        id: resource.id,
        name: shareDisplayName,
        metadataJson,
      }) ?? resource
  }

  const documentIdsForEvent =
    sharedDocumentIds ??
    (docsToSync.length > 0 ? docsToSync.map((doc) => doc.id) : undefined)

  await appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'Knowledge',
    resourceId: kb.id,
    operatorId: member.id,
    eventType: 'Shared',
    payload: {
      kb_id: kb.id,
      name: shareDisplayName,
      description: kb.description,
      source_workspace_id: sourceWorkspaceId,
      ...(documentIdsForEvent && documentIdsForEvent.length > 0
        ? { document_ids: documentIdsForEvent }
        : {}),
    },
  })

  for (const doc of docsToSync) {
    try {
      await syncP2pKnowledgeDocument({
        workspaceId: input.workspaceId,
        knowledgeBaseId: kb.id,
        documentId: doc.id,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[p2p] failed to sync knowledge document ${doc.id}: ${message}`)
    }
  }

  return { sharedResource: mapSharedResourceRow(resource) }
}

export async function removeP2pKnowledgeDocuments(
  rawInput: unknown,
): Promise<{ sharedResource: P2pSharedResource | null }> {
  const input = P2pKnowledgeRemoveDocumentsInputSchema.parse(rawInput)
  const sharedRepo = getSharedResourceRepo()
  const resource = sharedRepo.findById(input.resourceId)
  if (!resource || resource.workspaceId !== input.workspaceId) {
    throw new Error('共享资源不存在')
  }
  if (resource.resourceType !== 'Knowledge') {
    throw new Error('只能修改知识库共享资源')
  }
  const member = assertCanManageSharedResource(input.workspaceId, resource.sharedBy)

  const metadata = readKnowledgeShareMetadata(resource.metadataJson)
  const kbId = resource.localResourceId ?? resource.id
  const allReadyDocIds = getDocumentRepository()
    .listByKb(kbId)
    .filter((doc) => doc.status === 'ready' && doc.absolutePath)
    .map((doc) => doc.id)

  const currentIds = metadata.documentIds ?? allReadyDocIds
  const removeSet = new Set(input.documentIds)
  const nextIds = currentIds.filter((id) => !removeSet.has(id))

  if (nextIds.length === currentIds.length) {
    throw new Error('未能移除所选文档')
  }

  if (nextIds.length === 0) {
    sharedRepo.update({ id: resource.id, status: 'unshared' })
    await appendP2pEvent({
      workspaceId: input.workspaceId,
      resourceType: 'Knowledge',
      resourceId: kbId,
      operatorId: member.id,
      eventType: 'Deleted',
      payload: { kb_id: kbId },
    })
    return { sharedResource: null }
  }

  const metadataJson = buildKnowledgeShareMetadata({
    description: metadata.description,
    sourceWorkspaceId: metadata.sourceWorkspaceId,
    documentIds: nextIds,
    documentPermissions: metadata.documentPermissions
      ? Object.fromEntries(
          Object.entries(metadata.documentPermissions).filter(([id]) => !removeSet.has(id)),
        )
      : undefined,
  })
  const updated =
    sharedRepo.update({
      id: resource.id,
      metadataJson,
    }) ?? resource

  await appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'Knowledge',
    resourceId: kbId,
    operatorId: member.id,
    eventType: 'Shared',
    payload: {
      kb_id: kbId,
      name: stripGroupPrefixedName(input.workspaceId, updated.name),
      description: metadata.description,
      ...(metadata.sourceWorkspaceId ? { source_workspace_id: metadata.sourceWorkspaceId } : {}),
      document_ids: nextIds,
    },
  })

  return { sharedResource: mapSharedResourceRow(updated) }
}

export async function unshareP2pKnowledge(rawInput: unknown): Promise<{ unshared: true }> {
  const input = P2pResourceUnshareInputSchema.parse(rawInput)
  const sharedRepo = getSharedResourceRepo()
  const resource = sharedRepo.findById(input.resourceId)
  if (!resource || resource.workspaceId !== input.workspaceId) {
    throw new Error('共享资源不存在')
  }
  if (resource.resourceType !== 'Knowledge') {
    throw new Error('只能取消共享知识库资源')
  }
  const member = assertCanManageSharedResource(input.workspaceId, resource.sharedBy)

  sharedRepo.update({ id: resource.id, status: 'unshared' })

  await appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'Knowledge',
    resourceId: resource.localResourceId ?? resource.id,
    operatorId: member.id,
    eventType: 'Deleted',
    payload: {
      kb_id: resource.localResourceId ?? resource.id,
    },
  })

  return { unshared: true }
}

export async function syncP2pKnowledgeDocument(rawInput: unknown): Promise<{ event: WorkspaceEvent }> {
  const input = P2pKnowledgeSyncDocumentInputSchema.parse(rawInput)
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

export function listP2pSharedResources(rawInput: unknown): { resources: P2pSharedResource[] } {
  const input = P2pResourceListInputSchema.parse(rawInput)
  assertWorkspaceMemberAccess(input.workspaceId)

  const sharedRepo = getSharedResourceRepo()
  const rows = input.resourceType
    ? sharedRepo
        .listByWorkspace(input.workspaceId)
        .filter((row) => row.resourceType === input.resourceType)
    : sharedRepo.listByWorkspace(input.workspaceId)

  const resources = rows
    .filter((row) => (input.status ? row.status === input.status : row.status === 'active'))
    .map(mapSharedResourceRow)

  return { resources }
}

export async function maybeSyncSharedKnowledgeDocument(
  sourceWorkspaceId: string,
  kbId: string,
  documentId: string,
): Promise<void> {
  const kb = getKnowledgeBaseRepository().findRowById(kbId, sourceWorkspaceId)
  if (kb?.kind === 'shared') {
    return
  }

  const sharedRepo = getSharedResourceRepo()
  const shares = sharedRepo.listActiveByLocalResource(kbId, 'Knowledge')

  for (const shared of shares) {
    try {
      await syncP2pKnowledgeDocument({
        workspaceId: shared.workspaceId,
        knowledgeBaseId: kbId,
        documentId,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[p2p] auto knowledge sync failed for ${documentId}: ${message}`)
    }
  }
}

function sanitizeKnowledgeDocumentFileName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '文档'
  return trimmed.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim()
}

function sanitizeGroupFolderName(name: string): string {
  const sanitized = sanitizeKnowledgeDocumentFileName(name)
  return sanitized || '群组'
}

function resolveKnowledgeDocumentPermission(
  metadata: KnowledgeShareMetadata,
  documentId: string,
): P2pKnowledgeDocumentPermission {
  return metadata.documentPermissions?.[documentId] ?? 'read'
}

export async function setP2pKnowledgeDocumentPermission(rawInput: unknown): Promise<{
  sharedResource: P2pSharedResource
}> {
  const input = P2pKnowledgeSetDocumentPermissionInputSchema.parse(rawInput)
  const sharedRepo = getSharedResourceRepo()
  const resource = sharedRepo.findById(input.resourceId)
  if (!resource || resource.workspaceId !== input.workspaceId) {
    throw new Error('共享资源不存在')
  }
  if (resource.resourceType !== 'Knowledge' || resource.status !== 'active') {
    throw new Error('共享资源不存在')
  }

  const member = assertCanManageSharedResource(input.workspaceId, resource.sharedBy)
  const metadata = readKnowledgeShareMetadata(resource.metadataJson)
  const kbId = resource.localResourceId ?? resource.id
  const allReadyDocIds = getDocumentRepository()
    .listByKb(kbId)
    .filter((doc) => doc.status === 'ready' && doc.absolutePath)
    .map((doc) => doc.id)
  const sharedDocumentIds = metadata.documentIds ?? allReadyDocIds
  if (!sharedDocumentIds.includes(input.documentId)) {
    throw new Error('文件未共享到群组')
  }

  const documentPermissions = {
    ...(metadata.documentPermissions ?? {}),
    [input.documentId]: input.permission,
  }
  const metadataJson = buildKnowledgeShareMetadata({
    description: metadata.description,
    sourceWorkspaceId: metadata.sourceWorkspaceId,
    documentIds: metadata.documentIds,
    documentPermissions,
  })

  const updated =
    sharedRepo.update({
      id: resource.id,
      metadataJson,
    }) ?? resource

  await appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'Knowledge',
    resourceId: kbId,
    operatorId: member.id,
    eventType: 'Updated',
    payload: {
      kb_id: kbId,
      doc_id: input.documentId,
      document_permission: input.permission,
    },
  })

  return { sharedResource: mapSharedResourceRow(updated) }
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
    contentEvent,
  }
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

  const cachedPath = await ensureP2pKnowledgeBlobCached({
    p2pWorkspaceId: input.workspaceId,
    storageWorkspaceId,
    kbId: content.sourceKbId,
    docId: input.documentId,
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

  let cachedPath = await ensureP2pKnowledgeBlobCached({
    p2pWorkspaceId: input.workspaceId,
    storageWorkspaceId,
    kbId: content.sourceKbId,
    docId: input.documentId,
    title: content.title,
    contentHash: content.contentHash,
    mimeType: content.mimeType,
    sharedBy: content.sharedBy,
  })
  if (!cachedPath) {
    await syncMissingSharedKnowledgeDocuments(input.workspaceId)
    cachedPath = await ensureP2pKnowledgeBlobCached({
      p2pWorkspaceId: input.workspaceId,
      storageWorkspaceId,
      kbId: content.sourceKbId,
      docId: input.documentId,
      title: content.title,
      contentHash: content.contentHash,
      mimeType: content.mimeType,
      sharedBy: content.sharedBy,
    })
  }
  if (!cachedPath) {
    throw new Error('文档内容尚未同步到群组，请稍后重试')
  }

  const p2pWorkspace = new P2pWorkspaceRepository(getDatabase()).findById(input.workspaceId)
  if (!p2pWorkspace) {
    throw new Error('群组不存在')
  }

  const sharedRepo = getSharedResourceRepo()
  const resource = sharedRepo.findById(input.resourceId)
  const sharedFolderName = resource
    ? stripGroupPrefixedName(input.workspaceId, resource.name)
    : '共享文件夹'

  const { kbId, storagePath } = ensureUserSavedGroupKnowledgeBase(
    storageWorkspaceId,
    input.workspaceId,
    p2pWorkspace.name,
    sharedFolderName,
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

  const savedDoc = getDocumentRepository().findByPath(kbId, destinationPath)
  if (!savedDoc) {
    throw new Error('保存文档失败')
  }

  return { absolutePath: destinationPath, savedDocumentId: savedDoc.id }
}
