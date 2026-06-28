import { existsSync } from 'node:fs'
import { logStructured } from '../structured-log.service'
import { sep } from 'node:path'
import { hashFileBytes } from '@toolman/knowledge'
import { P2pSharedResourceRepository } from '@toolman/db'
import type { WorkspaceEvent } from '@toolman/shared'
import {isP2pSharedKnowledgeMirrorDescription, toErrorMessage } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../../db/repos'
import { blobExists, writeBlobFromPath } from '../blob.service'
import { isSystemKnowledgeBase } from '../knowledge-default-folder-kb.service'
import { ensureKnowledgeBaseStorageSource } from '../knowledge-kb-storage-source.service'
import { resolveKnowledgeBaseStoragePath } from '../knowledge-kb-storage-path.service'
import {
  ensureP2pKnowledgeBlobCached,
  isP2pKnowledgeBlobCached,
} from './p2p-knowledge-blob-cache.service'
import { listWorkspaceEventsSince } from './p2p-event.service'
import { parseKnowledgeDocumentPermissionsFromPayload } from './p2p-knowledge-share-metadata'
import {
  resolvePersonalStorageWorkspaceId,
  stripGroupPrefixedName,
} from './p2p-group-resource-naming'
import { getActiveWorkspaceMember } from './p2p-permission.guard'
import { resolveLocalSharedByMemberId } from './p2p-shared-by-member.service'

function getSharedResourceRepo(): P2pSharedResourceRepository {
  return new P2pSharedResourceRepository(getDatabase())
}

function readPayloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key]
  return typeof value === 'string' ? value : undefined
}

function readSharedKnowledgeSourceWorkspaceId(metadataJson: string | null | undefined): string | null {
  if (!metadataJson) return null
  try {
    const parsed = JSON.parse(metadataJson) as { sourceWorkspaceId?: string }
    return typeof parsed.sourceWorkspaceId === 'string' ? parsed.sourceWorkspaceId : null
  } catch {
    return null
  }
}

function isLocalKnowledgeSharer(p2pWorkspaceId: string, sharedBy: string | null | undefined): boolean {
  if (!sharedBy) return false
  try {
    return getActiveWorkspaceMember(p2pWorkspaceId).id === sharedBy
  } catch {
    return false
  }
}

/** Keep the sharer's original local KB row out of P2P mirror/projection state. */
export function protectOwnerSourceKnowledgeBase(
  p2pWorkspaceId: string,
  sourceKbId: string,
  sourceWorkspaceId: string,
  originalName?: string,
): void {
  const kbRepo = getKnowledgeBaseRepository()
  const row = kbRepo.findRowById(sourceKbId, sourceWorkspaceId)
  if (!row) return

  const plainName = stripGroupPrefixedName(p2pWorkspaceId, originalName ?? row.name)
  const targetName = isSystemKnowledgeBase(row)
    ? row.name
    : isSystemKnowledgeBase({ name: plainName })
      ? plainName
      : plainName

  const mirrorDescription = isP2pSharedKnowledgeMirrorDescription(row.description)
  const needsRestore =
    row.kind !== 'local' ||
    row.name !== targetName ||
    mirrorDescription

  if (!needsRestore) return

  const description = mirrorDescription
    ? isSystemKnowledgeBase({ name: targetName })
      ? '默认文件夹知识库'
      : null
    : row.description

  kbRepo.update({
    id: sourceKbId,
    workspaceId: sourceWorkspaceId,
    name: targetName,
    kind: 'local',
    description,
  })

  const updated = kbRepo.findRowById(sourceKbId, sourceWorkspaceId)
  if (!updated) return

  const storagePath = resolveKnowledgeBaseStoragePath(updated, { ensure: true })
  if (storagePath) {
    ensureKnowledgeBaseStorageSource(sourceWorkspaceId, sourceKbId, storagePath)
  }
}

import { findSharedResourceForProjection, resolveSharedResourceId } from './p2p-shared-resource-id'

export function reconcileKnowledgeSharedResources(workspaceId: string): void {
  const terminalByKb = new Map<string, WorkspaceEvent>()

  let sinceSeq = 0
  while (true) {
    const batch = listWorkspaceEventsSince(workspaceId, sinceSeq, 200)
    if (batch.length === 0) break

    for (const event of batch) {
      sinceSeq = event.seq
      if (event.resourceType !== 'Knowledge') continue
      if (
        event.eventType !== 'Shared' &&
        event.eventType !== 'Created' &&
        event.eventType !== 'Deleted'
      ) {
        continue
      }

      const kbId = readPayloadString(event.payload, 'kb_id') ?? event.resourceId
      terminalByKb.set(kbId, event)
    }

    if (batch.length < 200) break
  }

  for (const event of terminalByKb.values()) {
    try {
      if (event.eventType === 'Deleted') {
        projectKnowledgeDeletedEvent(event)
        continue
      }
      projectKnowledgeSharedEvent(event)
    } catch (error) {
      logStructured(
        'p2p',
        'warn',
        `reconcile knowledge ${event.resourceId}: ${toErrorMessage(error, String(error))}`,
      )
    }
  }
}

export function projectKnowledgeSharedEvent(event: WorkspaceEvent): void {
  if (event.resourceType !== 'Knowledge') {
    return
  }
  if (event.eventType !== 'Shared' && event.eventType !== 'Created') {
    return
  }

  const kbId = readPayloadString(event.payload, 'kb_id') ?? event.resourceId
  const name = stripGroupPrefixedName(
    event.workspaceId,
    readPayloadString(event.payload, 'name') ?? '共享知识库',
  )
  const description = readPayloadString(event.payload, 'description') ?? null
  const sourceWorkspaceId = readPayloadString(event.payload, 'source_workspace_id')
  const documentIdsRaw = event.payload.document_ids
  const documentIds = Array.isArray(documentIdsRaw)
    ? documentIdsRaw.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : undefined
  const documentPermissions = parseKnowledgeDocumentPermissionsFromPayload(event.payload)

  const sharedRepo = getSharedResourceRepo()
  const existing = findSharedResourceForProjection(sharedRepo, event.workspaceId, kbId, 'Knowledge')
  const existingMetadata = existing?.metadataJson
    ? (() => {
        try {
          return JSON.parse(existing.metadataJson) as {
            documentPermissions?: Record<string, string>
          }
        } catch {
          return {}
        }
      })()
    : {}

  const metadataJson = JSON.stringify({
    description,
    ...(sourceWorkspaceId ? { sourceWorkspaceId } : {}),
    ...(documentIds && documentIds.length > 0 ? { documentIds } : {}),
    ...(documentPermissions || existingMetadata.documentPermissions
      ? {
          documentPermissions: {
            ...(existingMetadata.documentPermissions ?? {}),
            ...(documentPermissions ?? {}),
          },
        }
      : {}),
  })

  const resourceId =
    existing?.id ?? resolveSharedResourceId(sharedRepo, kbId, event.workspaceId)
  const sharedBy = resolveLocalSharedByMemberId(
    event.workspaceId,
    event.operatorId,
    event.sourceDeviceId,
  )
  if (!existing) {
    sharedRepo.create({
      id: resourceId,
      workspaceId: event.workspaceId,
      resourceType: 'Knowledge',
      localResourceId: kbId,
      name,
      sharedBy,
      permission: 'read',
      metadataJson,
      createdAt: new Date(event.timestamp),
      updatedAt: new Date(event.timestamp),
    })
  } else if (
    existing.name !== name ||
    existing.metadataJson !== metadataJson ||
    existing.status !== 'active' ||
    existing.sharedBy !== sharedBy
  ) {
    sharedRepo.update({
      id: resourceId,
      name,
      metadataJson,
      status: 'active',
      sharedBy,
    })
  }

  try {
    const localMember = getActiveWorkspaceMember(event.workspaceId)
    if (event.operatorId === localMember.id && sourceWorkspaceId) {
      protectOwnerSourceKnowledgeBase(event.workspaceId, kbId, sourceWorkspaceId, name)
    }
  } catch {
    // viewer is not a member of this workspace yet
  }
}

export function projectKnowledgeDeletedEvent(event: WorkspaceEvent): void {
  if (event.resourceType !== 'Knowledge' || event.eventType !== 'Deleted') {
    return
  }

  const kbId = readPayloadString(event.payload, 'kb_id') ?? event.resourceId
  const sharedRepo = getSharedResourceRepo()
  const resource = findSharedResourceForProjection(sharedRepo, event.workspaceId, kbId, 'Knowledge')
  if (resource) {
    sharedRepo.update({ id: resource.id, status: 'unshared' })
  }
}

function isP2pSyncedKnowledgePath(absolutePath: string): boolean {
  return absolutePath.includes(`${sep}p2p-sync${sep}`)
}

function ensureLocalBlobFromDocument(
  doc: {
    absolutePath?: string | null
  } | null,
  contentHash: string,
): boolean {
  const path = doc?.absolutePath
  if (!path || !existsSync(path) || isP2pSyncedKnowledgePath(path)) {
    return false
  }
  try {
    if (hashFileBytes(path) !== contentHash) {
      return false
    }
    if (!blobExists(contentHash)) {
      writeBlobFromPath(path)
    }
    return blobExists(contentHash)
  } catch {
    return false
  }
}

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
