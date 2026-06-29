import {
  KnowledgeDocumentDeleteInputSchema,
  KnowledgeDocumentIngestInputSchema,
  KnowledgeDocumentListInputSchema,
  KnowledgeIngestJobListInputSchema,
  KnowledgeIngestJobSchema,
  type KnowledgeDocument,
  type KnowledgeIngestJob,
} from '@toolman/shared'
import { toErrorMessage } from '@toolman/shared'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../../db/repos'
import { prepareIngestQueue, purgeIndexedDocument, reconcileStuckLocalFilesDocuments, startIngestFilePathsInBackground } from '../knowledge-ingest.service'
import { assertKnowledgeBaseAcceptsLocalFiles } from '../knowledge-kb-kind-guard'
import {
  deleteManagedKnowledgeFileFromDisk,
  isIgnoredKnowledgeDocument,
  parseErrorJson,
  toDocument,
} from './helpers'

export async function listKnowledgeDocuments(input: unknown): Promise<KnowledgeDocument[]> {
  const data = KnowledgeDocumentListInputSchema.parse(input)
  const kbRepo = getKnowledgeBaseRepository()
  const kb =
    kbRepo.findRowById(data.kbId, data.workspaceId) ?? kbRepo.findRowByIdOnly(data.kbId)
  if (!kb) return []

  if (kb.kind === 'local_files') {
    await reconcileStuckLocalFilesDocuments(data.workspaceId, data.kbId)
  }

  const repo = getDocumentRepository()
  return repo
    .listByKb(data.kbId)
    .filter((row) => !isIgnoredKnowledgeDocument(row))
    .map((row) => {
    const registry =
      repo.findRegistryByDocumentId(row.id) ??
      (row.absolutePath ? repo.findRegistryByPath(data.workspaceId, row.absolutePath) : null)
    return toDocument(row, repo.countChunksByDocument(row.id, data.kbId), registry?.sizeBytes ?? null)
  })
}

export function listKnowledgeIngestJobs(input: unknown): KnowledgeIngestJob[] {
  const data = KnowledgeIngestJobListInputSchema.parse(input)
  const repo = getDocumentRepository()
  return repo
    .listPendingIngestJobs({
      workspaceId: data.workspaceId,
      kbId: data.kbId,
      includeFailed: data.includeFailed ?? true,
    })
    .filter(({ document }) => !isIgnoredKnowledgeDocument(document))
    .map(({ job, document }) =>
    KnowledgeIngestJobSchema.parse({
      id: job.id,
      documentId: job.documentId,
      kbId: job.kbId,
      workspaceId: job.workspaceId,
      stage: job.stage,
      progress: job.progress,
      title: document.title,
      absolutePath: document.absolutePath,
      errorMessage: parseErrorJson(document.errorJson),
      createdAt: job.createdAt.getTime(),
    }),
  )
}

export async function ingestKnowledgeDocuments(input: unknown) {
  const data = KnowledgeDocumentIngestInputSchema.parse(input)
  const kb = getKnowledgeBaseRepository().findRowById(data.kbId, data.workspaceId)
  if (!kb) {
    throw new Error('知识库不存在')
  }
  assertKnowledgeBaseAcceptsLocalFiles(kb)

  const prepared = prepareIngestQueue({
    workspaceId: data.workspaceId,
    kbId: data.kbId,
    filePaths: data.filePaths,
  })

  startIngestFilePathsInBackground({
    workspaceId: data.workspaceId,
    kbId: data.kbId,
    filePaths: prepared.filePaths,
  })

  return {
    ingested: 0,
    skipped: prepared.skipped,
    queued: prepared.filePaths.length,
    failed: prepared.failed,
  }
}

export async function deleteKnowledgeDocument(input: unknown): Promise<boolean> {
  const data = KnowledgeDocumentDeleteInputSchema.parse(input)
  const kb = getKnowledgeBaseRepository().findRowById(data.kbId, data.workspaceId)
  if (!kb) return false

  const repo = getDocumentRepository()
  const doc = repo.findById(data.documentId, data.kbId)
  if (!doc) return false

  try {
    deleteManagedKnowledgeFileFromDisk(kb, doc.absolutePath)
  } catch (error) {
    const message = toErrorMessage(error, '删除本地文件失败')
    throw new Error(message)
  }

  await purgeIndexedDocument({
    workspaceId: data.workspaceId,
    kbId: data.kbId,
    documentId: data.documentId,
  })

  getKnowledgeBaseRepository().update({
    id: data.kbId,
    workspaceId: data.workspaceId,
    documentCount: repo.countByKb(data.kbId),
    chunkCount: repo.countChunksByKb(data.kbId),
  })

  return true
}
