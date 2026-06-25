import type { KnowledgeBaseRow } from '@toolman/db'
import { logStructured } from '../structured-log.service'
import type { P2pSharedResource } from '@toolman/shared'
import { toErrorMessage } from '@toolman/shared'
import {
  P2pKnowledgeRemoveDocumentsInputSchema,
  P2pKnowledgeSetDocumentPermissionInputSchema,
  P2pKnowledgeShareInputSchema,
  P2pResourceListInputSchema,
  P2pResourceUnshareInputSchema,
} from '@toolman/shared'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../../db/repos'
import { appendP2pEvent } from './p2p-event.service'
import { protectOwnerSourceKnowledgeBase } from './p2p-knowledge-projection'
import {
  buildKnowledgeShareMetadata,
  mergeSharedDocumentIds,
  readKnowledgeShareMetadata,
} from './p2p-knowledge-share-metadata'
import { syncP2pKnowledgeDocument } from './knowledge-sync-document.service'
import { getSharedResourceRepo, mapSharedResourceRow } from './knowledge-sync-shared-resource'
import {
  findSharedResourceInWorkspace,
  resolveSharedResourceId,
} from './p2p-shared-resource-id'
import {
  assertCanManageSharedResource,
  assertCanShareResource,
  assertWorkspaceMemberAccess,
} from './p2p-permission.guard'
import { getDefaultWorkspace } from '../workspace.service'
import { stripGroupPrefixedName } from './p2p-group-resource-naming'

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
      const message = toErrorMessage(error, String(error))
      logStructured('p2p', 'warn', `failed to sync knowledge document ${doc.id}: ${message}`)
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
      const message = toErrorMessage(error, String(error))
      logStructured('p2p', 'warn', `auto knowledge sync failed for ${documentId}: ${message}`)
    }
  }
}
