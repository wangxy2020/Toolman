import { existsSync } from 'node:fs'
import {
  KnowledgeIngestJobCancelInputSchema,
  KnowledgeIngestJobRetryInputSchema,
} from '@toolman/shared'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../db/repos'
import {
  clearIngestCancel,
  requestCancelIngest,
} from './knowledge-ingest-manager.service'
import { broadcastKnowledgeIngestEvent } from './knowledge-ingest-broadcast'
import { refreshKbStats, startIngestFilePathsInBackground } from './knowledge-ingest.service'
import { updateDocumentStage } from './knowledge-ingest-shared'

const ACTIVE_INGEST_STAGES = new Set([
  'queued',
  'parsing',
  'ocr',
  'chunking',
  'embedding',
  'indexing',
])

function isActiveIngest(docStatus: string | null | undefined, jobStage: string | undefined): boolean {
  if (docStatus && ACTIVE_INGEST_STAGES.has(docStatus)) return true
  if (jobStage && ACTIVE_INGEST_STAGES.has(jobStage)) return true
  return false
}

export function cancelKnowledgeIngestJob(input: unknown): boolean {
  const data = KnowledgeIngestJobCancelInputSchema.parse(input)
  const repo = getDocumentRepository()
  const doc = repo.findById(data.documentId, data.kbId)
  if (!doc) return false

  const job = repo.findIngestJobByDocumentId(data.documentId)
  if (!isActiveIngest(doc.status, job?.stage)) {
    return true
  }

  requestCancelIngest(data.documentId)

  repo.update(data.documentId, data.kbId, {
    status: 'cancelled',
    errorJson: null,
  })
  repo.upsertIngestJob({
    workspaceId: data.workspaceId,
    kbId: data.kbId,
    documentId: data.documentId,
    stage: 'cancelled',
    progress: 0,
    errorJson: null,
  })
  broadcastKnowledgeIngestEvent({
    type: 'document.stage',
    workspaceId: data.workspaceId,
    kbId: data.kbId,
    documentId: data.documentId,
    stage: 'cancelled',
    errorMessage: null,
  })
  refreshKbStats(data.workspaceId, data.kbId)

  return true
}

export function retryKnowledgeIngestJob(input: unknown): boolean {
  const data = KnowledgeIngestJobRetryInputSchema.parse(input)
  const repo = getDocumentRepository()
  const kb = getKnowledgeBaseRepository().findRowById(data.kbId, data.workspaceId)
  if (!kb) return false

  const doc = repo.findById(data.documentId, data.kbId)
  if (!doc?.absolutePath) return false
  if (doc.absolutePath.startsWith('http://') || doc.absolutePath.startsWith('https://')) {
    return false
  }

  if (!existsSync(doc.absolutePath)) {
    updateDocumentStage(repo, {
      workspaceId: data.workspaceId,
      kbId: data.kbId,
      documentId: data.documentId,
      stage: 'failed',
      errorMessage: '源文件不存在，请重新上传后再重试',
      progress: 0,
    })
    refreshKbStats(data.workspaceId, data.kbId)
    return false
  }

  clearIngestCancel(data.documentId)
  updateDocumentStage(repo, {
    workspaceId: data.workspaceId,
    kbId: data.kbId,
    documentId: data.documentId,
    stage: 'queued',
    errorMessage: null,
    progress: 5,
  })

  startIngestFilePathsInBackground({
    workspaceId: data.workspaceId,
    kbId: data.kbId,
    filePaths: [doc.absolutePath],
  })

  return true
}
