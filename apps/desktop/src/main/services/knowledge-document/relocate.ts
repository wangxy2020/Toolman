import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  KnowledgeDocumentRelocateInputSchema,
  toErrorMessage,
} from '@toolman/shared'
import { moveDocumentVectors } from '@toolman/knowledge'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../../db/repos'
import { getWorkspaceKnowledgeDir } from '../knowledge.service'
import { resolveEmbedConfig } from '../knowledge-embed.service'
import { appendDocumentFts, removeDocumentFts } from '../knowledge-fts.service'
import { ingestFileAtPath } from '../knowledge-ingest-file'
import { refreshKbStats } from '../knowledge-ingest-shared'
import { purgeIndexedDocument } from '../knowledge-ingest-reindex'
import { deleteKnowledgeDocument } from './list-ingest'
import { deleteManagedKnowledgeFileFromDisk } from './helpers'

function embeddingsCompatible(
  source: ReturnType<typeof resolveEmbedConfig>,
  dest: ReturnType<typeof resolveEmbedConfig>,
): boolean {
  return source.embedModel === dest.embedModel && source.embedDimension === dest.embedDimension
}

export async function relocateKnowledgeDocuments(input: unknown) {
  const data = KnowledgeDocumentRelocateInputSchema.parse(input)
  const kbRepo = getKnowledgeBaseRepository()
  const sourceKb = kbRepo.findRowById(data.sourceKbId, data.workspaceId)
  const destKb = kbRepo.findRowById(data.destKbId, data.workspaceId)
  if (!sourceKb || !destKb) {
    throw new Error('知识库不存在')
  }
  if (data.sourceKbId === data.destKbId) {
    throw new Error('目标知识库不能与来源相同')
  }

  const repo = getDocumentRepository()
  const destFolderSource =
    repo.listSourcesByKb(data.destKbId).find((source) => source.type === 'folder') ?? null
  const vectorsDir = join(getWorkspaceKnowledgeDir(data.workspaceId), 'vectors')
  const sourceEmbed = resolveEmbedConfig(data.workspaceId, data.sourceKbId)
  const destEmbed = resolveEmbedConfig(data.workspaceId, data.destKbId)
  const canReuseVectors = embeddingsCompatible(sourceEmbed, destEmbed)

  let moved = 0
  let ingested = 0
  const failed: Array<{ documentId: string; path: string; message: string }> = []

  for (const item of data.items) {
    try {
      const reused = canReuseVectors
        ? await tryRelocateIndexedDocument({
            workspaceId: data.workspaceId,
            sourceKbId: data.sourceKbId,
            destKbId: data.destKbId,
            documentId: item.documentId,
            destPath: item.destPath,
            destSourceId: destFolderSource?.id ?? null,
            vectorsDir,
            sourceEmbed,
            destEmbed,
          })
        : false

      if (reused) {
        moved += 1
        continue
      }

      const ingestResult = await ingestFileAtPath({
        workspaceId: data.workspaceId,
        kbId: data.destKbId,
        filePath: item.destPath,
        sourceId: destFolderSource?.id ?? null,
      })
      if (ingestResult.outcome === 'failed') {
        failed.push({
          documentId: item.documentId,
          path: item.destPath,
          message: ingestResult.message ?? '导入失败',
        })
        continue
      }

      const deleted = await deleteKnowledgeDocument({
        workspaceId: data.workspaceId,
        kbId: data.sourceKbId,
        documentId: item.documentId,
      })
      if (!deleted) {
        failed.push({
          documentId: item.documentId,
          path: item.destPath,
          message: '目标已导入，但来源文件未能删除',
        })
        continue
      }
      ingested += 1
    } catch (error) {
      failed.push({
        documentId: item.documentId,
        path: item.destPath,
        message: toErrorMessage(error, '移动失败'),
      })
    }
  }

  refreshKbStats(data.workspaceId, data.sourceKbId)
  refreshKbStats(data.workspaceId, data.destKbId)
  return { moved, ingested, failed }
}

async function tryRelocateIndexedDocument(options: {
  workspaceId: string
  sourceKbId: string
  destKbId: string
  documentId: string
  destPath: string
  destSourceId: string | null
  vectorsDir: string
  sourceEmbed: ReturnType<typeof resolveEmbedConfig>
  destEmbed: ReturnType<typeof resolveEmbedConfig>
}): Promise<boolean> {
  const repo = getDocumentRepository()
  const sourceKb = getKnowledgeBaseRepository().findRowById(options.sourceKbId, options.workspaceId)
  const doc = repo.findById(options.documentId, options.sourceKbId)
  if (!doc || doc.status !== 'ready' || !existsSync(options.destPath)) {
    return false
  }

  const chunkRows = repo.listChunkRowsByDocument(options.documentId, options.sourceKbId)
  if (chunkRows.length === 0) return false

  const destExisting = repo.findByPath(options.destKbId, options.destPath)
  if (destExisting && destExisting.id !== options.documentId) {
    await purgeIndexedDocument({
      workspaceId: options.workspaceId,
      kbId: options.destKbId,
      documentId: destExisting.id,
    })
  }

  const movedVectors = await moveDocumentVectors({
    vectorsDir: options.vectorsDir,
    sourceKbId: options.sourceKbId,
    destKbId: options.destKbId,
    documentId: options.documentId,
    destPath: options.destPath,
    sourceBackend: options.sourceEmbed.vectorBackend,
    destBackend: options.destEmbed.vectorBackend,
    embedModel: options.destEmbed.embedModel,
  })
  if (movedVectors === 0) return false

  const sourcePath = doc.absolutePath
  const reassigned = repo.reassignDocumentKb({
    documentId: options.documentId,
    fromKbId: options.sourceKbId,
    toKbId: options.destKbId,
    absolutePath: options.destPath,
    sourceId: options.destSourceId,
  })
  if (!reassigned) {
    await moveDocumentVectors({
      vectorsDir: options.vectorsDir,
      sourceKbId: options.destKbId,
      destKbId: options.sourceKbId,
      documentId: options.documentId,
      destPath: sourcePath ?? options.destPath,
      sourceBackend: options.destEmbed.vectorBackend,
      destBackend: options.sourceEmbed.vectorBackend,
      embedModel: options.sourceEmbed.embedModel,
    })
    return false
  }

  if (sourcePath) {
    repo.renameFileRegistryPath(options.workspaceId, sourcePath, options.destPath)
  }
  const stat = statSync(options.destPath)
  repo.upsertFileRegistry({
    workspaceId: options.workspaceId,
    absolutePath: options.destPath,
    contentHash: doc.contentHash ?? '',
    sizeBytes: stat.size,
    mtimeMs: stat.mtimeMs,
    documentId: options.documentId,
  })

  removeDocumentFts(options.documentId)
  await appendDocumentFts(options.documentId, options.destKbId, chunkRows)

  if (sourceKb && sourcePath && sourcePath !== options.destPath) {
    deleteManagedKnowledgeFileFromDisk(sourceKb, sourcePath)
  }

  return true
}
