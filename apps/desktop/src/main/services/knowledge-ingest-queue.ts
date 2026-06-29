import { toErrorMessage } from '@toolman/shared'
import { hashFileBytes, isIgnoredKnowledgeIngestFile } from '@toolman/knowledge'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../db/repos'
import { knowledgeIngestSupportsFile } from './knowledge-parse-options.service'
import { logStructured } from './structured-log.service'
import { isIngestCancelled } from './knowledge-ingest-manager.service'
import { findActiveDocumentByPath, shouldSkipReadyDocument } from './knowledge-document-lifecycle.util'
import {
  buildDocumentTitle,
  recordIngestFailure,
  refreshKbStats,
  updateDocumentStage,
} from './knowledge-ingest-shared'
import { ingestFileAtPath } from './knowledge-ingest-file'

const MAX_CONCURRENT_INGEST_JOBS = 2

let activeIngestJobs = 0
const ingestJobWaiters: Array<() => void> = []

async function acquireIngestJobSlot(): Promise<void> {
  if (activeIngestJobs < MAX_CONCURRENT_INGEST_JOBS) {
    activeIngestJobs += 1
    return
  }
  await new Promise<void>((resolve) => {
    ingestJobWaiters.push(resolve)
  })
  activeIngestJobs += 1
}

function releaseIngestJobSlot(): void {
  activeIngestJobs = Math.max(0, activeIngestJobs - 1)
  const next = ingestJobWaiters.shift()
  if (next) next()
}

export function prepareIngestQueue(options: {
  workspaceId: string
  kbId: string
  filePaths: string[]
}) {
  const repo = getDocumentRepository()
  const kb = getKnowledgeBaseRepository().findRowById(options.kbId, options.workspaceId)
  const storageOnly = kb?.kind === 'local_files'
  const pending: string[] = []
  let skipped = 0
  const failed: Array<{ path: string; message: string }> = []

  if (kb?.kind === 'network') {
    const message = '网络知识库仅支持网页 URL，不能导入本地文件'
    for (const filePath of options.filePaths) {
      if (isIgnoredKnowledgeIngestFile(filePath)) {
        skipped += 1
        continue
      }
      recordIngestFailure(repo, options.workspaceId, options.kbId, filePath, message)
      failed.push({ path: filePath, message })
    }
    if (failed.length > 0) {
      refreshKbStats(options.workspaceId, options.kbId)
    }
    return { filePaths: pending, skipped, failed }
  }

  for (const filePath of options.filePaths) {
    if (isIgnoredKnowledgeIngestFile(filePath)) {
      skipped += 1
      continue
    }

    if (!storageOnly && !knowledgeIngestSupportsFile(filePath)) {
      recordIngestFailure(repo, options.workspaceId, options.kbId, filePath, '不支持的文件类型')
      failed.push({ path: filePath, message: '不支持的文件类型' })
      continue
    }

    try {
      const contentHash = hashFileBytes(filePath)
      const existing = findActiveDocumentByPath(repo, options.kbId, filePath)

      if (existing && shouldSkipReadyDocument(repo, options.kbId, existing.id, contentHash, existing)) {
        skipped += 1
        continue
      }

      const title = buildDocumentTitle(filePath)
      if (existing) {
        updateDocumentStage(repo, {
          workspaceId: options.workspaceId,
          kbId: options.kbId,
          documentId: existing.id,
          stage: 'queued',
          errorMessage: null,
          patch: { title },
        })
      } else {
        const created = repo.create({
          kbId: options.kbId,
          sourceId: null,
          title,
          contentHash: null,
          status: 'queued',
          absolutePath: filePath,
        })
        updateDocumentStage(repo, {
          workspaceId: options.workspaceId,
          kbId: options.kbId,
          documentId: created.id,
          stage: 'queued',
          errorMessage: null,
        })
      }

      pending.push(filePath)
    } catch (error) {
      const message = toErrorMessage(error, '无法读取文件')
      recordIngestFailure(repo, options.workspaceId, options.kbId, filePath, message)
      failed.push({ path: filePath, message })
    }
  }

  if (pending.length > 0) {
    refreshKbStats(options.workspaceId, options.kbId, { status: 'indexing' })
  } else if (failed.length > 0) {
    refreshKbStats(options.workspaceId, options.kbId)
  }

  return { filePaths: pending, skipped, failed }
}

export function startIngestFilePathsInBackground(options: {
  workspaceId: string
  kbId: string
  filePaths: string[]
}) {
  if (options.filePaths.length === 0) return

  void ingestFilePaths({
    workspaceId: options.workspaceId,
    kbId: options.kbId,
    filePaths: options.filePaths,
  }).catch((error) => {
    logStructured('knowledge', 'error', `background ingest failed`, { detail: error })
    refreshKbStats(options.workspaceId, options.kbId, { status: 'error' })
  })
}

export async function ingestFilePaths(options: {
  workspaceId: string
  kbId: string
  filePaths: string[]
  sourceId?: string | null
}) {
  getKnowledgeBaseRepository().update({
    id: options.kbId,
    workspaceId: options.workspaceId,
    status: 'indexing',
  })

  let ingested = 0
  let skipped = 0
  const failed: Array<{ path: string; message: string }> = []
  const repo = getDocumentRepository()

  const ingestOne = async (filePath: string) => {
    const existing = repo.findByPath(options.kbId, filePath)
    if (existing && isIngestCancelled(existing.id)) {
      return { outcome: 'skipped' as const, path: filePath }
    }

    await acquireIngestJobSlot()
    try {
      return await ingestFileAtPath({
        workspaceId: options.workspaceId,
        kbId: options.kbId,
        filePath,
        sourceId: options.sourceId,
        documentId: existing?.id,
      })
    } finally {
      releaseIngestJobSlot()
    }
  }

  const results = await Promise.all(options.filePaths.map((filePath) => ingestOne(filePath)))
  for (const result of results) {
    if (result.outcome === 'ingested') ingested++
    else if (result.outcome === 'skipped') skipped++
    else failed.push({ path: result.path, message: result.message ?? '导入失败' })
  }

  refreshKbStats(options.workspaceId, options.kbId, {
    status: failed.length > 0 && ingested === 0 ? 'error' : 'idle',
  })

  return { ingested, skipped, failed }
}
