import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { extname, join, sep } from 'node:path'
import { hashFileBytes } from '@toolman/knowledge'
import { P2pMemberRepository, P2pSharedResourceRepository } from '@toolman/db'
import type { WorkspaceEvent } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../../db/repos'
import { blobExists, readBlobBytes, writeBlobFromPath } from '../blob.service'
import { getWorkspaceKnowledgeDir } from '../knowledge.service'
import { ingestFileAtPath } from '../knowledge-ingest.service'
import { fetchBlobFromPeers } from './p2p-blob-transfer.service'
import { listWorkspaceEventsSince } from './p2p-event.service'
import {
  buildGroupPrefixedName,
  resolvePersonalStorageWorkspaceId,
} from './p2p-group-resource-naming'
import { getActiveWorkspaceMember } from './p2p-permission.guard'

function getSharedResourceRepo(): P2pSharedResourceRepository {
  return new P2pSharedResourceRepository(getDatabase())
}

function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

function readPayloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key]
  return typeof value === 'string' ? value : undefined
}

function ensureKnowledgeBase(
  p2pWorkspaceId: string,
  kbId: string,
  name: string,
  description?: string | null,
): string | null {
  const storageWorkspaceId = resolvePersonalStorageWorkspaceId()
  if (!storageWorkspaceId) return null

  const kbRepo = getKnowledgeBaseRepository()
  const displayName = buildGroupPrefixedName(p2pWorkspaceId, name)

  const syncDisplayName = (workspaceId: string) => {
    const row = kbRepo.findRowById(kbId, workspaceId)
    if (row && row.name !== displayName) {
      kbRepo.update({
        id: kbId,
        workspaceId,
        name: displayName,
      })
    }
  }

  const existingInStorage = kbRepo.findRowById(kbId, storageWorkspaceId)
  if (existingInStorage) {
    syncDisplayName(storageWorkspaceId)
    return storageWorkspaceId
  }

  const existingAnywhere = kbRepo.findRowByIdAny(kbId)
  if (existingAnywhere) {
    if (existingAnywhere.workspaceId === storageWorkspaceId) {
      if (existingAnywhere.deletedAt) {
        kbRepo.restore(kbId, storageWorkspaceId)
      }
      syncDisplayName(storageWorkspaceId)
      return storageWorkspaceId
    }
    return existingAnywhere.workspaceId
  }

  getWorkspaceKnowledgeDir(storageWorkspaceId)
  try {
    kbRepo.create({
      id: kbId,
      workspaceId: storageWorkspaceId,
      name: displayName,
      description: description ?? undefined,
      kind: 'network',
    })
    return storageWorkspaceId
  } catch (error) {
    const raced = kbRepo.findRowByIdAny(kbId)
    if (raced) {
      if (raced.workspaceId === storageWorkspaceId && raced.deletedAt) {
        kbRepo.restore(kbId, storageWorkspaceId)
      }
      syncDisplayName(raced.workspaceId)
      return raced.workspaceId
    }
    throw error
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
  const name = readPayloadString(event.payload, 'name') ?? '共享知识库'
  const description = readPayloadString(event.payload, 'description') ?? null
  const sourceWorkspaceId = readPayloadString(event.payload, 'source_workspace_id')
  const documentIdsRaw = event.payload.document_ids
  const documentIds = Array.isArray(documentIdsRaw)
    ? documentIdsRaw.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : undefined

  const metadataJson = JSON.stringify({
    description,
    ...(sourceWorkspaceId ? { sourceWorkspaceId } : {}),
    ...(documentIds && documentIds.length > 0 ? { documentIds } : {}),
  })

  const sharedRepo = getSharedResourceRepo()
  const existing = sharedRepo.findById(kbId)
  if (!existing) {
    sharedRepo.create({
      id: kbId,
      workspaceId: event.workspaceId,
      resourceType: 'Knowledge',
      localResourceId: kbId,
      name,
      sharedBy: event.operatorId,
      permission: 'read',
      metadataJson,
      createdAt: new Date(event.timestamp),
      updatedAt: new Date(event.timestamp),
    })
  } else {
    sharedRepo.update({ id: kbId, name, metadataJson })
  }

  try {
    const localMember = getActiveWorkspaceMember(event.workspaceId)
    if (event.operatorId !== localMember.id) {
      ensureKnowledgeBase(event.workspaceId, kbId, name, description)
    }
  } catch {
    ensureKnowledgeBase(event.workspaceId, kbId, name, description)
  }
}

export function projectKnowledgeDeletedEvent(event: WorkspaceEvent): void {
  if (event.resourceType !== 'Knowledge' || event.eventType !== 'Deleted') {
    return
  }

  const kbId = readPayloadString(event.payload, 'kb_id') ?? event.resourceId
  const sharedRepo = getSharedResourceRepo()
  const resource = sharedRepo.findById(kbId)
  if (resource) {
    sharedRepo.update({ id: kbId, status: 'unshared' })
  }
}

function extensionForTitle(title: string, mimeType: string): string {
  const fromTitle = extname(title)
  if (fromTitle) return fromTitle
  if (mimeType === 'application/pdf') return '.pdf'
  if (mimeType === 'text/plain') return '.txt'
  if (mimeType === 'text/markdown') return '.md'
  return ''
}

function isP2pSyncedKnowledgePath(absolutePath: string): boolean {
  return absolutePath.includes(`${sep}p2p-sync${sep}`)
}

function documentMatchesContentHash(
  doc: {
    contentHash?: string | null
    blobHash?: string | null
    absolutePath?: string | null
    status?: string
  },
  contentHash: string,
): boolean {
  if (doc.contentHash === contentHash || doc.blobHash === contentHash) {
    return true
  }
  const path = doc.absolutePath
  if (!path || !existsSync(path) || isP2pSyncedKnowledgePath(path)) {
    return false
  }
  try {
    return hashFileBytes(path) === contentHash
  } catch {
    return false
  }
}

function shouldSkipOwnerReingest(input: {
  p2pWorkspaceId: string
  kbId: string
  docId: string
  contentHash: string
  sharedBy: string | null | undefined
}): boolean {
  const member = getActiveWorkspaceMember(input.p2pWorkspaceId)
  if (!input.sharedBy || input.sharedBy !== member.id) {
    return false
  }

  const docRepo = getDocumentRepository()
  const existing = docRepo.findById(input.docId, input.kbId)
  if (!existing || existing.status !== 'ready') {
    return false
  }

  return documentMatchesContentHash(existing, input.contentHash)
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
  const title = readPayloadString(event.payload, 'title') ?? '文档'
  const contentHash = readPayloadString(event.payload, 'content_hash')
  const mimeType = readPayloadString(event.payload, 'mime_type') ?? 'application/octet-stream'

  if (!kbId || !docId || !contentHash) {
    return
  }

  const sharedRepo = getSharedResourceRepo()
  const shared = sharedRepo.findById(kbId)
  const storageWorkspaceId = ensureKnowledgeBase(
    event.workspaceId,
    kbId,
    shared?.name ?? title,
  )
  if (!storageWorkspaceId) {
    return
  }

  const docRepo = getDocumentRepository()
  if (
    shouldSkipOwnerReingest({
      p2pWorkspaceId: event.workspaceId,
      kbId,
      docId,
      contentHash,
      sharedBy: shared?.sharedBy,
    })
  ) {
    docRepo.update(docId, kbId, { blobHash: contentHash })
    return
  }

  const existing = docRepo.findById(docId, kbId)
  if (existing && documentMatchesContentHash(existing, contentHash)) {
    if (!blobExists(contentHash)) {
      ensureLocalBlobFromDocument(existing, contentHash)
    }
    return
  }

  if (ensureLocalBlobFromDocument(existing, contentHash)) {
    // fall through to ingest below
  } else {
    const sharer = shared?.sharedBy ? getMemberRepo().findById(shared.sharedBy) : null
    const fetched = await fetchBlobFromPeers(
      event.workspaceId,
      contentHash,
      mimeType,
      sharer?.deviceId,
    )
    if (!fetched) {
      console.warn(`[p2p] knowledge blob ${contentHash} not available for doc ${docId}`)
      return
    }
  }

  const syncDir = join(getWorkspaceKnowledgeDir(storageWorkspaceId), 'p2p-sync', kbId)
  mkdirSync(syncDir, { recursive: true })
  const filePath = join(syncDir, `${docId}${extensionForTitle(title, mimeType)}`)
  writeFileSync(filePath, readBlobBytes(contentHash))

  if (shared) {
    sharedRepo.update({
      id: kbId,
      contentHash,
      version: (shared.version ?? 1) + 1,
    })
  }

  const result = await ingestFileAtPath({
    workspaceId: storageWorkspaceId,
    kbId,
    filePath,
    documentId: docId,
    skipP2pSync: true,
  })

  if (result.outcome === 'ingested' || result.outcome === 'skipped') {
    docRepo.update(docId, kbId, { blobHash: contentHash })
  }
}

export async function syncMissingSharedKnowledgeDocuments(workspaceId: string): Promise<number> {
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

  const docRepo = getDocumentRepository()
  let synced = 0

  for (const event of listWorkspaceEventsSince(workspaceId, 0)) {
    if (event.resourceType !== 'Knowledge' || event.eventType !== 'Updated') {
      continue
    }

    const kbId = readPayloadString(event.payload, 'kb_id')
    const docId = readPayloadString(event.payload, 'doc_id')
    if (!kbId || !docId || !activeKbIds.has(kbId)) {
      continue
    }

    const existing = docRepo.findById(docId, kbId)
    if (
      existing?.status === 'ready' &&
      existing.absolutePath &&
      existsSync(existing.absolutePath)
    ) {
      continue
    }

    try {
      await applyKnowledgeUpdatedEvent(event)
      synced += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[p2p] replay knowledge doc ${docId} failed: ${message}`)
    }
  }

  return synced
}
