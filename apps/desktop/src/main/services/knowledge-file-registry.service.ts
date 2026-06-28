import {
  KnowledgeFileRegistryItemSchema,
  KnowledgeFileRegistryListInputSchema,
  type KnowledgeFileRegistryItem,
} from '@toolman/shared'
import { isIgnoredKnowledgeIngestFile } from '@toolman/knowledge'
import { getDocumentRepository } from '../db/repos'

export function listKnowledgeFileRegistry(input: unknown): KnowledgeFileRegistryItem[] {
  const data = KnowledgeFileRegistryListInputSchema.parse(input)
  const repo = getDocumentRepository()

  repo.pruneOrphanedFileRegistry(data.workspaceId)
  repo.reconcileFileRegistryPaths(data.workspaceId)

  return repo
    .listFileRegistryByWorkspace(data.workspaceId, { limit: data.limit })
    .filter((row) => !isIgnoredKnowledgeIngestFile(row.registry.absolutePath))
    .map((row) =>
    KnowledgeFileRegistryItemSchema.parse({
      id: row.registry.id,
      absolutePath: row.registry.absolutePath,
      contentHash: row.registry.contentHash,
      sizeBytes: row.registry.sizeBytes,
      mtimeMs: row.registry.mtimeMs,
      documentId: row.registry.documentId,
      documentTitle: row.document?.title ?? null,
      kbId: row.document?.kbId ?? null,
      kbName: row.kbName,
      updatedAt: row.registry.updatedAt.getTime(),
    }),
  )
}
