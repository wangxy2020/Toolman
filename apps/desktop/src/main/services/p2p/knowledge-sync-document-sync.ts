import { existsSync, statSync } from 'node:fs'
import type { WorkspaceEvent } from '@toolman/shared'
import { P2pKnowledgeSyncDocumentInputSchema } from '@toolman/shared'
import { getDocumentRepository } from '../../db/repos'
import { writeBlobFromPath } from '../blob.service'
import { appendP2pEvent } from './p2p-event.service'
import { pushBlobToPeers } from './p2p-blob-transfer.service'
import { getSharedResourceRepo } from './knowledge-sync-shared-resource'
import {
  assertCanEditSharedResource,
  assertWorkspaceMemberAccess,
} from './p2p-permission.guard'

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
