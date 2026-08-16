import type { DocumentRepository } from '@toolman/db'
import { isIgnoredKnowledgeIngestFile } from '@toolman/knowledge'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../db/repos'
import { clearIngestCancel } from './knowledge-ingest-manager.service'
import {
  findActiveDocumentById,
  findActiveDocumentByPath,
} from './knowledge-document-lifecycle.util'
import { buildDocumentTitle, updateDocumentStage } from './knowledge-ingest-shared-stage'

export interface IngestFileAtPathOptions {
  workspaceId: string
  kbId: string
  filePath: string
  sourceId?: string | null
  documentId?: string
  skipP2pSync?: boolean
}

export interface IngestFileAtPathResult {
  outcome: 'ingested' | 'skipped' | 'failed'
  path: string
  message?: string
}

export function recordIngestFailure(
  repo: DocumentRepository,
  workspaceId: string,
  kbId: string,
  filePath: string,
  message: string,
) {
  if (isIgnoredKnowledgeIngestFile(filePath)) return

  const title = buildDocumentTitle(filePath)

  const existing = findActiveDocumentByPath(repo, kbId, filePath)
  if (existing) {
    updateDocumentStage(repo, {
      workspaceId,
      kbId,
      documentId: existing.id,
      stage: 'failed',
      errorMessage: message,
      patch: { title },
    })
    return
  }

  const created = repo.create({
    kbId,
    sourceId: null,
    title,
    contentHash: null,
    status: 'failed',
    absolutePath: filePath,
  })
  updateDocumentStage(repo, {
    workspaceId,
    kbId,
    documentId: created.id,
    stage: 'failed',
    errorMessage: message,
  })
}

export function ensureIngestDocument(
  repo: DocumentRepository,
  workspaceId: string,
  kbId: string,
  filePath: string,
  contentHash: string,
  sourceId?: string | null,
  documentId?: string,
) {
  const title = buildDocumentTitle(filePath)

  if (documentId) {
    const existing = findActiveDocumentById(repo, kbId, documentId)
    if (existing) {
      clearIngestCancel(existing.id)
      updateDocumentStage(repo, {
        workspaceId,
        kbId,
        documentId: existing.id,
        stage: 'parsing',
        errorMessage: null,
        patch: { title, contentHash, absolutePath: filePath },
      })
      return existing
    }

    const created = repo.create({
      id: documentId,
      kbId,
      sourceId: sourceId ?? null,
      title,
      contentHash,
      status: 'parsing',
      absolutePath: filePath,
    })
    updateDocumentStage(repo, {
      workspaceId,
      kbId,
      documentId: created.id,
      stage: 'parsing',
      errorMessage: null,
    })
    return created
  }

  const existing = findActiveDocumentByPath(repo, kbId, filePath)
  if (existing) {
    clearIngestCancel(existing.id)
    updateDocumentStage(repo, {
      workspaceId,
      kbId,
      documentId: existing.id,
      stage: 'parsing',
      errorMessage: null,
      patch: { title, contentHash },
    })
    return existing
  }

  const created = repo.create({
    kbId,
    sourceId: sourceId ?? null,
    title,
    contentHash,
    status: 'parsing',
    absolutePath: filePath,
  })
  updateDocumentStage(repo, {
    workspaceId,
    kbId,
    documentId: created.id,
    stage: 'parsing',
    errorMessage: null,
  })
  return created
}

export function refreshKbStats(
  workspaceId: string,
  kbId: string,
  patch?: { status?: 'idle' | 'indexing' | 'reindexing' | 'error' },
) {
  const repo = getDocumentRepository()
  getKnowledgeBaseRepository().update({
    id: kbId,
    workspaceId,
    documentCount: repo.countByKb(kbId),
    chunkCount: repo.countChunksByKb(kbId),
    status: patch?.status,
  })
}
