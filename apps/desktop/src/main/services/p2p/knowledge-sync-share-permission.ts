import type { P2pSharedResource } from '@toolman/shared'
import { P2pKnowledgeSetDocumentPermissionInputSchema } from '@toolman/shared'
import { getDocumentRepository } from '../../db/repos'
import { appendP2pEvent } from './p2p-event.service'
import {
  buildKnowledgeShareMetadata,
  readKnowledgeShareMetadata,
} from './p2p-knowledge-share-metadata'
import { getSharedResourceRepo, mapSharedResourceRow } from './knowledge-sync-shared-resource'
import { assertCanManageSharedResource } from './p2p-permission.guard'

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
    sourceKbKind: metadata.sourceKbKind,
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
