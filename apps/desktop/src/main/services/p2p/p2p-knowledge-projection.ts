import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { extname, join, sep } from 'node:path'
import { hashFileBytes } from '@toolman/knowledge'
import { P2pSharedResourceRepository } from '@toolman/db'
import type { WorkspaceEvent } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../../db/repos'
import { readBlobBytes } from '../blob.service'
import { getWorkspaceKnowledgeDir } from '../knowledge.service'
import { ingestFileAtPath } from '../knowledge-ingest.service'
import { fetchBlobFromPeers } from './p2p-blob-transfer.service'
import { getActiveWorkspaceMember } from './p2p-permission.guard'

function getSharedResourceRepo(): P2pSharedResourceRepository {
  return new P2pSharedResourceRepository(getDatabase())
}

function readPayloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key]
  return typeof value === 'string' ? value : undefined
}

function ensureKnowledgeBase(
  workspaceId: string,
  kbId: string,
  name: string,
  description?: string | null,
): void {
  const kbRepo = getKnowledgeBaseRepository()
  if (kbRepo.findRowById(kbId, workspaceId)) {
    return
  }

  if (kbRepo.findRowByIdOnly(kbId)) {
    return
  }

  getWorkspaceKnowledgeDir(workspaceId)
  kbRepo.create({
    id: kbId,
    workspaceId,
    name,
    description: description ?? undefined,
    kind: 'network',
  })
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

  ensureKnowledgeBase(event.workspaceId, kbId, name, description)
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

function shouldSkipOwnerReingest(input: {
  workspaceId: string
  kbId: string
  docId: string
  contentHash: string
  sharedBy: string | null | undefined
}): boolean {
  const member = getActiveWorkspaceMember(input.workspaceId)
  if (!input.sharedBy || input.sharedBy !== member.id) {
    return false
  }

  const docRepo = getDocumentRepository()
  const existing = docRepo.findById(input.docId, input.kbId)
  if (!existing || existing.status !== 'ready' || existing.contentHash !== input.contentHash) {
    return false
  }

  const path = existing.absolutePath
  if (!path || !existsSync(path) || isP2pSyncedKnowledgePath(path)) {
    return false
  }

  try {
    return hashFileBytes(path) === input.contentHash
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
  ensureKnowledgeBase(event.workspaceId, kbId, shared?.name ?? title)

  const docRepo = getDocumentRepository()
  if (
    shouldSkipOwnerReingest({
      workspaceId: event.workspaceId,
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
  if (existing?.absolutePath && existsSync(existing.absolutePath)) {
    try {
      if (hashFileBytes(existing.absolutePath) === contentHash && existing.status === 'ready') {
        return
      }
    } catch {
      // continue with re-ingest
    }
  }

  const fetched = await fetchBlobFromPeers(event.workspaceId, contentHash, mimeType)
  if (!fetched) {
    console.warn(`[p2p] knowledge blob ${contentHash} not available for doc ${docId}`)
    return
  }

  const syncDir = join(getWorkspaceKnowledgeDir(event.workspaceId), 'p2p-sync', kbId)
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
    workspaceId: event.workspaceId,
    kbId,
    filePath,
    documentId: docId,
    skipP2pSync: true,
  })

  if (result.outcome === 'ingested' || result.outcome === 'skipped') {
    docRepo.update(docId, kbId, { blobHash: contentHash })
  }
}
