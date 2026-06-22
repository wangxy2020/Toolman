import { existsSync, statSync } from 'node:fs'
import {
  P2pSharedResourceRepository,
  type KnowledgeBaseRow,
  type P2pSharedResourceRow,
} from '@toolman/db'
import type { P2pSharedResource, WorkspaceEvent } from '@toolman/shared'
import {
  P2pKnowledgeRemoveDocumentsInputSchema,
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
import { pushBlobToPeers } from './p2p-blob-transfer.service'
import {
  findSharedResourceInWorkspace,
  resolveSharedResourceId,
} from './p2p-shared-resource-id'
import {
  assertCanEditSharedResource,
  assertCanManageSharedResource,
  assertCanShareResource,
  assertWorkspaceMemberAccess,
} from './p2p-permission.guard'
import { getDefaultWorkspace } from '../workspace.service'

function getSharedResourceRepo(): P2pSharedResourceRepository {
  return new P2pSharedResourceRepository(getDatabase())
}

interface KnowledgeShareMetadata {
  description?: string | null
  sourceWorkspaceId?: string
  documentIds?: string[]
}

function readKnowledgeShareMetadata(metadataJson: string): KnowledgeShareMetadata {
  try {
    const parsed = JSON.parse(metadataJson) as KnowledgeShareMetadata
    return {
      description: parsed.description ?? null,
      sourceWorkspaceId:
        typeof parsed.sourceWorkspaceId === 'string' ? parsed.sourceWorkspaceId : undefined,
      documentIds: Array.isArray(parsed.documentIds)
        ? parsed.documentIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : undefined,
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

  const existingMetadata = resource ? readKnowledgeShareMetadata(resource.metadataJson) : {}
  const shareWholeKnowledgeBase = !input.documentIds || input.documentIds.length === 0
  const sharedDocumentIds = shareWholeKnowledgeBase
    ? undefined
    : mergeSharedDocumentIds(existingMetadata.documentIds, input.documentIds)
  const metadataJson = buildKnowledgeShareMetadata({
    description: kb.description,
    sourceWorkspaceId,
    documentIds: sharedDocumentIds,
  })

  if (!resource) {
    resource = sharedRepo.create({
      id: resolveSharedResourceId(sharedRepo, kb.id, input.workspaceId),
      workspaceId: input.workspaceId,
      resourceType: 'Knowledge',
      localResourceId: kb.id,
      name: kb.name,
      sharedBy: member.id,
      permission: input.permission ?? 'read',
      metadataJson,
    })
  } else if (resource.status !== 'active') {
    resource =
      sharedRepo.update({
        id: resource.id,
        name: kb.name,
        status: 'active',
        metadataJson,
      }) ?? resource
  } else {
    resource =
      sharedRepo.update({
        id: resource.id,
        name: kb.name,
        metadataJson,
      }) ?? resource
  }

  await appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'Knowledge',
    resourceId: kb.id,
    operatorId: member.id,
    eventType: 'Shared',
    payload: {
      kb_id: kb.id,
      name: kb.name,
      description: kb.description,
      source_workspace_id: sourceWorkspaceId,
      ...(sharedDocumentIds ? { document_ids: sharedDocumentIds } : {}),
    },
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

  for (const doc of docsToSync) {
    const synced = docRepo.findById(doc.id, kb.id)
    const hash = synced?.blobHash ?? synced?.contentHash
    if (hash) {
      await pushBlobToPeers(input.workspaceId, hash, undefined)
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
      name: updated.name,
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

  void pushBlobToPeers(input.workspaceId, blob.hash, blob.mimeType)

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
  _sourceWorkspaceId: string,
  kbId: string,
  documentId: string,
): Promise<void> {
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
