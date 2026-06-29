import { isIgnoredKnowledgeIngestFile } from '@toolman/knowledge'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../db/repos'
import { logStructured } from './structured-log.service'
import { STALE_INGEST_MS } from './knowledge-ingest-timeouts'
import {
  ACTIVE_INGEST_STAGES,
  IN_FLIGHT_INGEST_STAGES,
  recordIngestFailure,
  refreshKbStats,
  updateDocumentStage,
} from './knowledge-ingest-shared'
import { registerStorageOnlyFileAtPath } from './knowledge-ingest-file'

export async function reconcileStuckLocalFilesDocuments(
  workspaceId: string,
  kbId: string,
): Promise<number> {
  const kb = getKnowledgeBaseRepository().findRowById(kbId, workspaceId)
  if (kb?.kind !== 'local_files') return 0

  const repo = getDocumentRepository()
  let fixed = 0

  for (const row of repo.listByKb(kbId)) {
    if (!row.absolutePath) continue
    if (row.status === 'ready' || row.status === 'failed') continue

    const result = await registerStorageOnlyFileAtPath({
      workspaceId,
      kbId,
      filePath: row.absolutePath,
      documentId: row.id,
    })
    if (result.outcome === 'ingested' || result.outcome === 'skipped') {
      fixed += 1
    }
  }

  if (fixed > 0) {
    refreshKbStats(workspaceId, kbId)
  }

  return fixed
}

export function recoverInterruptedIngestJobsOnStartup(): number {
  const repo = getDocumentRepository()
  const pending = repo.listResumableDocuments()
  let recovered = 0
  const message =
    '应用已退出，索引任务中断。请在设置 → 索引任务中点击重试，或点击文件旁的重新向量化。'

  for (const { job, document } of pending) {
    if (!IN_FLIGHT_INGEST_STAGES.has(job.stage)) continue

    updateDocumentStage(repo, {
      workspaceId: job.workspaceId,
      kbId: job.kbId,
      documentId: document.id,
      stage: 'failed',
      errorMessage: message,
    })
    recovered += 1
  }

  if (recovered > 0) {
    logStructured('knowledge', 'info', `recovered ${recovered} interrupted ingest jobs on startup`)
  }

  return recovered
}

export function reconcileProcessingDocumentsWithoutIngestJob(): number {
  const docRepo = getDocumentRepository()
  const kbRepo = getKnowledgeBaseRepository()
  let fixed = 0
  const message = '索引任务状态异常，请重新向量化'

  for (const kb of kbRepo.listAllActive()) {
    for (const doc of docRepo.listByKb(kb.id)) {
      if (!doc.status || !ACTIVE_INGEST_STAGES.has(doc.status)) continue
      if (docRepo.findIngestJobByDocumentId(doc.id)) continue

      updateDocumentStage(docRepo, {
        workspaceId: kb.workspaceId,
        kbId: kb.id,
        documentId: doc.id,
        stage: 'failed',
        errorMessage: message,
      })
      fixed += 1
    }
  }

  if (fixed > 0) {
    logStructured('knowledge', 'warn', `reconciled ${fixed} processing documents without ingest jobs`)
  }

  return fixed
}

export function recoverStaleIngestJobs(): number {
  const repo = getDocumentRepository()
  const pending = repo.listResumableDocuments()
  let recovered = 0

  for (const { job, document } of pending) {
    const startedAt = job.startedAt?.getTime() ?? job.createdAt.getTime()
    if (Date.now() - startedAt < STALE_INGEST_MS) continue
    if (!document.absolutePath) continue

    recordIngestFailure(
      repo,
      job.workspaceId,
      job.kbId,
      document.absolutePath,
      '索引任务超时或中断，请重新导入或点击重建索引',
    )
    recovered += 1
  }

  if (recovered > 0) {
    logStructured('knowledge', 'warn', `marked ${recovered} stale ingest jobs as failed`)
  }

  return recovered
}

export function purgeIgnoredKnowledgeDocuments(workspaceId: string, kbId: string): number {
  const repo = getDocumentRepository()
  let removed = 0

  for (const row of repo.listByKb(kbId)) {
    const path = row.absolutePath ?? row.title
    if (!isIgnoredKnowledgeIngestFile(path)) continue
    repo.softDelete(row.id, kbId)
    removed += 1
  }

  if (removed > 0) {
    refreshKbStats(workspaceId, kbId)
  }

  return removed
}
