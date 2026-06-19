import {
  KnowledgeIngestJobCancelInputSchema,
  KnowledgeIngestJobRetryInputSchema,
} from '@toolman/shared'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../db/repos'
import {
  clearIngestCancel,
  requestCancelIngest,
} from './knowledge-ingest-manager.service'
import { startIngestFilePathsInBackground } from './knowledge-ingest.service'

export function cancelKnowledgeIngestJob(input: unknown): boolean {
  const data = KnowledgeIngestJobCancelInputSchema.parse(input)
  const repo = getDocumentRepository()
  const doc = repo.findById(data.documentId, data.kbId)
  if (!doc) return false

  requestCancelIngest(data.documentId)

  if (doc.status === 'queued') {
    repo.update(data.documentId, data.kbId, {
      status: 'failed',
      errorJson: JSON.stringify({ message: '索引任务已取消' }),
    })
    repo.upsertIngestJob({
      workspaceId: data.workspaceId,
      kbId: data.kbId,
      documentId: data.documentId,
      stage: 'failed',
      progress: 0,
      errorJson: JSON.stringify({ message: '索引任务已取消' }),
    })
  }

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

  clearIngestCancel(data.documentId)
  repo.update(data.documentId, data.kbId, {
    status: 'queued',
    errorJson: null,
  })
  repo.upsertIngestJob({
    workspaceId: data.workspaceId,
    kbId: data.kbId,
    documentId: data.documentId,
    stage: 'queued',
    progress: 5,
    errorJson: null,
  })

  startIngestFilePathsInBackground({
    workspaceId: data.workspaceId,
    kbId: data.kbId,
    filePaths: [doc.absolutePath],
  })

  return true
}
