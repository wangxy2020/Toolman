import {
  buildKnowledgeIndexVersionId,
  buildKnowledgeIndexFingerprint,
} from '@toolman/shared'
import { getKnowledgeBaseRepository, getKnowledgeIndexVersionRepository } from '../db/repos'
import { resolveChunkConfig, resolveEmbedConfig } from './knowledge-embed.service'
import { buildIndexFingerprintFromKbJson } from './knowledge-index-fingerprint'
import { removeKbVectors } from '@toolman/knowledge'
import { join } from 'node:path'
import { getWorkspaceKnowledgeDir } from './knowledge.service'

export function ensureActiveKnowledgeIndexVersion(workspaceId: string, kbId: string): number {
  const kb = getKnowledgeBaseRepository().findRowById(kbId, workspaceId)
  if (!kb) return 1
  const repo = getKnowledgeIndexVersionRepository()
  const active = repo.findActiveByKb(kbId)
  if (active) return active.version
  const existingV1 = repo.findByKbAndVersion(kbId, 1)
  if (existingV1) {
    repo.updateStatus(kbId, 1, 'active')
    return 1
  }
  const embed = resolveEmbedConfig(workspaceId, kbId)
  const chunk = resolveChunkConfig(kbId, workspaceId)
  repo.create({
    id: buildKnowledgeIndexVersionId(kbId, 1),
    kbId,
    version: 1,
    embeddingModel: embed.embedModel,
    embeddingDimension: embed.embedDimension,
    chunkStrategy: chunk.strategy,
    chunkSize: chunk.chunkSize,
    chunkOverlap: chunk.chunkOverlap,
    reranker: null,
    vectorBackend: embed.vectorBackend,
    indexFingerprint: buildIndexFingerprintFromKbJson(kb.chunkConfigJson, kb.embedConfigJson),
    status: 'active',
  })
  return 1
}

export function resolveActiveIndexVersion(workspaceId: string, kbId: string): number {
  const kb = getKnowledgeBaseRepository().findRowById(kbId, workspaceId)
  if (kb?.activeIndexVersion && kb.activeIndexVersion > 0) {
    return kb.activeIndexVersion
  }
  return ensureActiveKnowledgeIndexVersion(workspaceId, kbId)
}

export function beginKnowledgeIndexRebuild(workspaceId: string, kbId: string): {
  indexVersion: number
  switched: boolean
} {
  const kb = getKnowledgeBaseRepository().findRowById(kbId, workspaceId)
  if (!kb) return { indexVersion: 1, switched: false }

  const embed = resolveEmbedConfig(workspaceId, kbId)
  const chunk = resolveChunkConfig(kbId, workspaceId)
  const fingerprint = buildKnowledgeIndexFingerprint({
    chunkStrategy: chunk.strategy,
    chunkSize: chunk.chunkSize,
    chunkOverlap: chunk.chunkOverlap,
    embeddingModel: embed.embedModel,
    embeddingDimension: embed.embedDimension,
    vectorBackend: embed.vectorBackend,
  })
  const repo = getKnowledgeIndexVersionRepository()
  const active = repo.findActiveByKb(kbId)
  const activeVersion = active?.version ?? kb.activeIndexVersion ?? 1
  if (!active?.indexFingerprint || active.indexFingerprint === fingerprint) {
    return { indexVersion: activeVersion, switched: false }
  }

  const nextVersion = activeVersion + 1
  const existingNext = repo.findByKbAndVersion(kbId, nextVersion)
  if (existingNext) {
    repo.updateStatus(kbId, nextVersion, 'building')
  } else {
    repo.create({
      id: buildKnowledgeIndexVersionId(kbId, nextVersion),
      kbId,
      version: nextVersion,
      embeddingModel: embed.embedModel,
      embeddingDimension: embed.embedDimension,
      chunkStrategy: chunk.strategy,
      chunkSize: chunk.chunkSize,
      chunkOverlap: chunk.chunkOverlap,
      vectorBackend: embed.vectorBackend,
      indexFingerprint: fingerprint,
      status: 'building',
    })
  }
  return { indexVersion: nextVersion, switched: true }
}

export async function activateKnowledgeIndexVersion(options: {
  workspaceId: string
  kbId: string
  indexVersion: number
  previousVersion: number
}): Promise<void> {
  const repo = getKnowledgeIndexVersionRepository()
  repo.updateStatus(options.kbId, options.indexVersion, 'active')
  if (options.previousVersion !== options.indexVersion) {
    repo.updateStatus(options.kbId, options.previousVersion, 'retired')
  }
  getKnowledgeBaseRepository().update({
    id: options.kbId,
    workspaceId: options.workspaceId,
    activeIndexVersion: options.indexVersion,
    status: 'idle',
  })

  if (options.previousVersion !== options.indexVersion) {
    const embed = resolveEmbedConfig(options.workspaceId, options.kbId)
    const vectorsDir = join(getWorkspaceKnowledgeDir(options.workspaceId), 'vectors')
    await removeKbVectors(vectorsDir, options.kbId, embed.vectorBackend, options.previousVersion)
  }
}

export async function failKnowledgeIndexVersion(options: {
  workspaceId: string
  kbId: string
  indexVersion: number
  message: string
}): Promise<void> {
  getKnowledgeIndexVersionRepository().updateStatus(
    options.kbId,
    options.indexVersion,
    'failed',
    JSON.stringify({ message: options.message }),
  )
  getKnowledgeBaseRepository().update({
    id: options.kbId,
    workspaceId: options.workspaceId,
    status: 'error',
  })
}
