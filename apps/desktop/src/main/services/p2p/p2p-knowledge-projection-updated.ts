import { logStructured } from '../structured-log.service'
import type { WorkspaceEvent } from '@toolman/shared'
import { toErrorMessage } from '@toolman/shared'
import { getDocumentRepository } from '../../db/repos'
import { blobExists } from '../blob.service'
import { listWorkspaceEventsSince } from './p2p-event.service'
import { parseKnowledgeDocumentPermissionsFromPayload } from './p2p-knowledge-share-metadata'
import {
  ensureP2pKnowledgeBlobCached,
  isP2pKnowledgeBlobCached,
} from './p2p-knowledge-blob-cache.service'
import { stripGroupPrefixedName, resolvePersonalStorageWorkspaceId } from './p2p-group-resource-naming'
import { findSharedResourceForProjection } from './p2p-shared-resource-id'
import { reconcileKnowledgeSharedResources } from './p2p-knowledge-projection-shared'
import {
  ensureLocalBlobFromDocument,
  getSharedResourceRepo,
  isLocalKnowledgeSharer,
  protectOwnerSourceKnowledgeBase,
  readPayloadString,
  readSharedKnowledgeSourceWorkspaceId,
} from './p2p-knowledge-projection-utils'

export async function applyKnowledgeUpdatedEvent(event: WorkspaceEvent): Promise<void> {
  if (event.resourceType !== 'Knowledge' || event.eventType !== 'Updated') {
    return
  }

  const kbId = readPayloadString(event.payload, 'kb_id')
  const docId = readPayloadString(event.payload, 'doc_id')
  const documentPermissions = parseKnowledgeDocumentPermissionsFromPayload(event.payload)
  const documentPermission = readPayloadString(event.payload, 'document_permission')

  if (documentPermissions || documentPermission) {
    const sharedRepo = getSharedResourceRepo()
    const shared = kbId
      ? findSharedResourceForProjection(sharedRepo, event.workspaceId, kbId, 'Knowledge')
      : null
    if (shared) {
      let existingMetadata: {
        description?: string | null
        sourceWorkspaceId?: string
        documentIds?: string[]
        documentPermissions?: Record<string, string>
      } = {}
      try {
        existingMetadata = JSON.parse(shared.metadataJson)
      } catch {
        existingMetadata = {}
      }
      const nextPermissions = {
        ...(existingMetadata.documentPermissions ?? {}),
        ...(documentPermissions ?? {}),
        ...(documentPermission && docId ? { [docId]: documentPermission } : {}),
      }
      const metadataJson = JSON.stringify({
        ...existingMetadata,
        documentPermissions: nextPermissions,
      })
      sharedRepo.update({
        id: shared.id,
        metadataJson,
      })
    }
    if (!docId || !readPayloadString(event.payload, 'content_hash')) {
      return
    }
  }

  const title = readPayloadString(event.payload, 'title') ?? '文档'
  const contentHash = readPayloadString(event.payload, 'content_hash')
  const mimeType = readPayloadString(event.payload, 'mime_type') ?? 'application/octet-stream'

  if (!kbId || !docId || !contentHash) {
    return
  }

  const sharedRepo = getSharedResourceRepo()
  const shared = findSharedResourceForProjection(sharedRepo, event.workspaceId, kbId, 'Knowledge')
  const sharedBy = shared?.sharedBy
  const isLocalSharer = isLocalKnowledgeSharer(event.workspaceId, sharedBy)
  const mirrorName = stripGroupPrefixedName(event.workspaceId, shared?.name ?? title)

  const storageWorkspaceId = isLocalSharer
    ? readSharedKnowledgeSourceWorkspaceId(shared?.metadataJson) ??
      readPayloadString(event.payload, 'source_workspace_id') ??
      resolvePersonalStorageWorkspaceId()
    : resolvePersonalStorageWorkspaceId()
  if (!storageWorkspaceId) {
    return
  }

  const docRepo = getDocumentRepository()

  if (isLocalSharer) {
    protectOwnerSourceKnowledgeBase(event.workspaceId, kbId, storageWorkspaceId, mirrorName)
    const existing = docRepo.findById(docId, kbId)
    if (existing?.status === 'ready') {
      if (!blobExists(contentHash)) {
        ensureLocalBlobFromDocument(existing, contentHash)
      }
      docRepo.update(docId, kbId, { blobHash: contentHash, contentHash })
    }
    return
  }

  const cachedPath = await ensureP2pKnowledgeBlobCached({
    p2pWorkspaceId: event.workspaceId,
    storageWorkspaceId,
    kbId,
    docId,
    title,
    contentHash,
    mimeType,
    sharedBy,
  })
  if (!cachedPath) {
    logStructured('p2p', 'warn', `knowledge blob ${contentHash} not available for doc ${docId}`)
    return
  }

  if (shared) {
    sharedRepo.update({
      id: shared.id,
      contentHash,
      version: (shared.version ?? 1) + 1,
    })
  }
}

export async function syncMissingSharedKnowledgeDocuments(workspaceId: string): Promise<number> {
  reconcileKnowledgeSharedResources(workspaceId)

  const sharedRepo = getSharedResourceRepo()
  const activeKbIds = new Set(
    sharedRepo
      .listByWorkspace(workspaceId)
      .filter((row) => row.resourceType === 'Knowledge' && row.status === 'active')
      .map((row) => row.localResourceId ?? row.id),
  )

  if (activeKbIds.size === 0) {
    return 0
  }

  let synced = 0

  let sinceSeq = 0
  while (true) {
    const batch = listWorkspaceEventsSince(workspaceId, sinceSeq, 200)
    if (batch.length === 0) break

    for (const event of batch) {
      sinceSeq = event.seq
      if (event.resourceType !== 'Knowledge' || event.eventType !== 'Updated') {
        continue
      }

      const kbId = readPayloadString(event.payload, 'kb_id')
      const docId = readPayloadString(event.payload, 'doc_id')
      const contentHash = readPayloadString(event.payload, 'content_hash')
      if (!kbId || !docId || !contentHash || !activeKbIds.has(kbId)) {
        continue
      }

      const title = readPayloadString(event.payload, 'title') ?? '文档'
      const mimeType = readPayloadString(event.payload, 'mime_type') ?? 'application/octet-stream'
      const storageWorkspaceId = resolvePersonalStorageWorkspaceId()
      if (
        storageWorkspaceId &&
        isP2pKnowledgeBlobCached({
          storageWorkspaceId,
          p2pWorkspaceId: workspaceId,
          kbId,
          docId,
          title,
          contentHash,
          mimeType,
        })
      ) {
        continue
      }

      try {
        await applyKnowledgeUpdatedEvent(event)
        synced += 1
      } catch (error) {
        const message = toErrorMessage(error, String(error))
        logStructured('p2p', 'warn', `replay knowledge doc ${docId} failed: ${message}`)
      }
    }

    if (batch.length < 200) break
  }

  return synced
}
