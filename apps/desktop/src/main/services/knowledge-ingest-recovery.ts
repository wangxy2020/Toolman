import { existsSync } from 'node:fs'
import { isIgnoredKnowledgeIngestFile } from '@toolman/knowledge'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../db/repos'
import { logStructured } from './structured-log.service'
import { STALE_INGEST_MS } from './knowledge-ingest-timeouts'
import { shouldRestoreIndexedDocumentStatus } from './knowledge-document-lifecycle.util'
import { clearIngestCancel, isIngestInFlight } from './knowledge-ingest-manager.service'
import {
  ACTIVE_INGEST_STAGES,
  IN_FLIGHT_INGEST_STAGES,
  PARSE_INCOMPLETE_INGEST_STAGES,
  recordIngestFailure,
  refreshKbStats,
  updateDocumentStage,
} from './knowledge-ingest-shared'
import { registerStorageOnlyFileAtPath } from './knowledge-ingest-file'

export const APP_EXIT_INTERRUPT_MESSAGE =
  '应用已退出，索引任务中断。请在设置 → 索引任务中点击重试，或点击文件旁的重新向量化。'

function isHttpUrl(path: string | null | undefined): boolean {
  if (!path) return false
  return path.startsWith('http://') || path.startsWith('https://')
}

export function isAppExitInterruptError(errorJson: string | null | undefined): boolean {
  if (!errorJson) return false
  return errorJson.includes('应用已退出，索引任务中断')
}

function requeueInterruptedIngest(options: {
  workspaceId: string
  kbId: string
  documentId: string
  absolutePath: string | null | undefined
}): 'queued' | 'missing' | 'skipped' {
  const path = options.absolutePath
  if (!path || isHttpUrl(path)) return 'skipped'
  if (!existsSync(path)) {
    updateDocumentStage(getDocumentRepository(), {
      workspaceId: options.workspaceId,
      kbId: options.kbId,
      documentId: options.documentId,
      stage: 'failed',
      errorMessage: '源文件不存在，请重新上传后再重试',
      progress: 0,
    })
    return 'missing'
  }

  clearIngestCancel(options.documentId)
  updateDocumentStage(getDocumentRepository(), {
    workspaceId: options.workspaceId,
    kbId: options.kbId,
    documentId: options.documentId,
    stage: 'queued',
    errorMessage: null,
    progress: 5,
  })
  return 'queued'
}

function restoreIndexedDocument(options: {
  workspaceId: string
  kbId: string
  documentId: string
  status: string | null | undefined
  /** Also rewrite ready/stale rows so a leftover parsing job is closed. */
  syncExistingIndex?: boolean
}): boolean {
  if (isIngestInFlight(options.documentId)) return false
  if (options.status === 'failed' || options.status === 'cancelled') return false
  if (
    !options.syncExistingIndex &&
    (options.status === 'ready' || options.status === 'stale')
  ) {
    return false
  }
  const repo = getDocumentRepository()
  const job = repo.findIngestJobByDocumentId?.(options.documentId)
  if (job && PARSE_INCOMPLETE_INGEST_STAGES.has(job.stage)) return false
  if (
    !shouldRestoreIndexedDocumentStatus({
      status: options.syncExistingIndex ? 'parsing' : options.status,
      chunkCount: repo.countChunksByDocument(options.documentId, options.kbId),
      ingestInFlight: false,
    })
  ) {
    return false
  }

  updateDocumentStage(repo, {
    workspaceId: options.workspaceId,
    kbId: options.kbId,
    documentId: options.documentId,
    stage: 'ready',
    errorMessage: null,
  })
  return true
}

/** Ready files left in parsing/queued after a rebuild or crash should show as indexed again. */
export function restoreIndexedDocumentsNotInFlight(kbId?: string): number {
  const docRepo = getDocumentRepository()
  const kbRepo = getKnowledgeBaseRepository()
  let fixed = 0

  for (const kb of kbRepo.listAllActive()) {
    if (kbId && kb.id !== kbId) continue
    for (const doc of docRepo.listByKb(kb.id)) {
      if (
        restoreIndexedDocument({
          workspaceId: kb.workspaceId,
          kbId: kb.id,
          documentId: doc.id,
          status: doc.status,
        })
      ) {
        fixed += 1
      }
    }
  }

  if (fixed > 0) {
    logStructured('knowledge', 'info', `restored ${fixed} indexed documents that were idle`)
  }

  return fixed
}


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
  const kbRepo = getKnowledgeBaseRepository()
  const pending = repo.listResumableDocuments()
  let recovered = 0

  for (const { job, document } of pending) {
    if (!IN_FLIGHT_INGEST_STAGES.has(job.stage)) continue
    if (
      !PARSE_INCOMPLETE_INGEST_STAGES.has(job.stage) &&
      restoreIndexedDocument({
        workspaceId: job.workspaceId,
        kbId: job.kbId,
        documentId: document.id,
        status: document.status,
        syncExistingIndex: true,
      })
    ) {
      recovered += 1
      continue
    }

    const queued = requeueInterruptedIngest({
      workspaceId: job.workspaceId,
      kbId: job.kbId,
      documentId: document.id,
      absolutePath: document.absolutePath,
    })
    if (queued === 'queued' || queued === 'missing') {
      recovered += 1
      continue
    }

    updateDocumentStage(repo, {
      workspaceId: job.workspaceId,
      kbId: job.kbId,
      documentId: document.id,
      stage: 'failed',
      errorMessage: APP_EXIT_INTERRUPT_MESSAGE,
    })
    recovered += 1
  }

  for (const kb of kbRepo.listAllActive()) {
    for (const doc of repo.listByKb(kb.id)) {
      if (doc.status !== 'failed') continue
      const job = repo.findIngestJobByDocumentId(doc.id)
      if (!isAppExitInterruptError(doc.errorJson) && !isAppExitInterruptError(job?.errorJson)) {
        continue
      }
      if (
        requeueInterruptedIngest({
          workspaceId: kb.workspaceId,
          kbId: kb.id,
          documentId: doc.id,
          absolutePath: doc.absolutePath,
        }) === 'queued'
      ) {
        recovered += 1
      }
    }
  }

  if (recovered > 0) {
    logStructured('knowledge', 'info', `recovered ${recovered} interrupted ingest jobs on startup`)
  }

  return recovered
}

export function reconcileProcessingDocumentsWithoutIngestJob(kbId?: string): number {
  const docRepo = getDocumentRepository()
  const kbRepo = getKnowledgeBaseRepository()
  let fixed = 0
  const message = '索引任务状态异常，请重新向量化'

  for (const kb of kbRepo.listAllActive()) {
    if (kbId && kb.id !== kbId) continue
    for (const doc of docRepo.listByKb(kb.id)) {
      if (!doc.status || !ACTIVE_INGEST_STAGES.has(doc.status)) continue
      if (docRepo.findIngestJobByDocumentId(doc.id)) continue
      if (
        restoreIndexedDocument({
          workspaceId: kb.workspaceId,
          kbId: kb.id,
          documentId: doc.id,
          status: doc.status,
        })
      ) {
        fixed += 1
        continue
      }

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
    if (
      restoreIndexedDocument({
        workspaceId: job.workspaceId,
        kbId: job.kbId,
        documentId: document.id,
        status: document.status,
        syncExistingIndex: true,
      })
    ) {
      recovered += 1
      continue
    }

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
