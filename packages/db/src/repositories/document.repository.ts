import type { ToolmanDatabase } from '../index.js'
import type { DocumentRow } from '../types/knowledge.js'
import type { CreateChunkInput, CreateDocumentInput } from './document-repository-types.js'
import {
  findAnyDocumentById,
  findAnyDocumentByPath,
  findDocumentById,
  findDocumentByIdAndKb,
  findDocumentByPath,
  restoreDocument,
} from './document-repository-find.js'
import {
  countDocumentsByKb,
  listActiveDocumentIdsByKb,
  listDocumentsByKb,
  listFileRegistryByWorkspace,
  listPendingIngestJobs,
  listResumableDocuments,
  listUrlDocumentsByKb,
} from './document-repository-list.js'
import {
  clearRegistryForDocumentIds,
  deleteIngestJobByDocumentId,
  deleteIngestJobsByKb,
  findIngestJobByDocumentId,
  pruneOrphanedFileRegistry,
  upsertIngestJob,
} from './document-repository-ingest.js'
import {
  createDocument,
  createDocumentSource,
  findDocumentSourceByUri,
  getDocumentSourceById,
  listDocumentSourcesByKb,
  reassignDocumentKb,
  softDeleteAllChunksByKb,
  softDeleteAllDocumentsByKb,
  softDeleteAllSourcesByKb,
  softDeleteDocument,
  softDeleteDocumentSource,
  updateDocument,
} from './document-repository-mutate.js'
import {
  findRegistryByDocumentId,
  findRegistryByPath,
  reconcileFileRegistryPaths,
  renameFileRegistryPath,
  upsertFileRegistry,
} from './document-repository-registry.js'
import {
  countAllActiveChunks,
  countChunksByDocument,
  countChunksByKb,
  deleteChunksByDocument,
  getChunksByIds,
  listAllActiveChunkTexts,
  listChunkRowsByDocument,
  listChunkTextsByDocument,
  replaceChunks,
} from './document-repository-chunks.js'

export type { CreateChunkInput, CreateDocumentInput } from './document-repository-types.js'

export class DocumentRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  findById(id: string, kbId: string) {
    return findDocumentByIdAndKb(this.db, id, kbId)
  }

  findDocumentById(id: string) {
    return findDocumentById(this.db, id)
  }

  findAnyById(id: string, kbId: string) {
    return findAnyDocumentById(this.db, id, kbId)
  }

  findByPath(kbId: string, absolutePath: string) {
    return findDocumentByPath(this.db, kbId, absolutePath)
  }

  findAnyByPath(kbId: string, absolutePath: string) {
    return findAnyDocumentByPath(this.db, kbId, absolutePath)
  }

  restoreDocument(id: string, kbId: string) {
    return restoreDocument(this.db, id, kbId)
  }

  listByKb(kbId: string) {
    return listDocumentsByKb(this.db, kbId)
  }

  listUrlDocumentsByKb(kbId: string) {
    return listUrlDocumentsByKb(this.db, kbId)
  }

  listResumableDocuments(workspaceId?: string) {
    return listResumableDocuments(this.db, workspaceId)
  }

  listPendingIngestJobs(options: {
    workspaceId: string
    kbId?: string
    includeFailed?: boolean
  }) {
    return listPendingIngestJobs(this.db, options)
  }

  listFileRegistryByWorkspace(workspaceId: string, options?: { limit?: number }) {
    return listFileRegistryByWorkspace(this.db, workspaceId, options)
  }

  create(input: CreateDocumentInput) {
    return createDocument(this.db, input)
  }

  update(
    id: string,
    kbId: string,
    patch: Partial<{
      title: string
      contentHash: string | null
      mimeType: string | null
      status: DocumentRow['status']
      errorJson: string | null
      metadataJson: string
      absolutePath: string | null
      blobHash: string | null
    }>,
  ) {
    return updateDocument(this.db, id, kbId, patch)
  }

  reassignDocumentKb(input: {
    documentId: string
    fromKbId: string
    toKbId: string
    absolutePath: string
    sourceId: string | null
  }) {
    return reassignDocumentKb(this.db, input)
  }

  softDelete(id: string, kbId: string) {
    return softDeleteDocument(this.db, id, kbId)
  }

  countByKb(kbId: string) {
    return countDocumentsByKb(this.db, kbId)
  }

  createSource(input: {
    kbId: string
    type: Parameters<typeof createDocumentSource>[1]['type']
    uri: string
    configJson?: string
  }) {
    return createDocumentSource(this.db, input)
  }

  getSourceById(id: string, kbId: string) {
    return getDocumentSourceById(this.db, id, kbId)
  }

  findSourceByUri(kbId: string, uri: string) {
    return findDocumentSourceByUri(this.db, kbId, uri)
  }

  listSourcesByKb(kbId: string) {
    return listDocumentSourcesByKb(this.db, kbId)
  }

  softDeleteSource(id: string, kbId: string) {
    return softDeleteDocumentSource(this.db, id, kbId)
  }

  softDeleteAllByKb(kbId: string) {
    softDeleteAllDocumentsByKb(this.db, kbId)
  }

  softDeleteAllSourcesByKb(kbId: string) {
    softDeleteAllSourcesByKb(this.db, kbId)
  }

  softDeleteAllChunksByKb(kbId: string) {
    softDeleteAllChunksByKb(this.db, kbId)
  }

  clearRegistryForDocumentIds(documentIds: string[]) {
    clearRegistryForDocumentIds(this.db, documentIds)
  }

  pruneOrphanedFileRegistry(workspaceId: string) {
    return pruneOrphanedFileRegistry(this.db, workspaceId)
  }

  deleteIngestJobsByKb(kbId: string) {
    deleteIngestJobsByKb(this.db, kbId)
  }

  deleteIngestJobByDocumentId(documentId: string) {
    deleteIngestJobByDocumentId(this.db, documentId)
  }

  findIngestJobByDocumentId(documentId: string) {
    return findIngestJobByDocumentId(this.db, documentId)
  }

  listActiveDocumentIdsByKb(kbId: string) {
    return listActiveDocumentIdsByKb(this.db, kbId)
  }

  upsertFileRegistry(input: {
    workspaceId: string
    absolutePath: string
    contentHash: string
    sizeBytes: number
    mtimeMs: number
    documentId?: string | null
  }) {
    return upsertFileRegistry(this.db, input)
  }

  renameFileRegistryPath(
    workspaceId: string,
    oldAbsolutePath: string,
    newAbsolutePath: string,
  ) {
    renameFileRegistryPath(this.db, workspaceId, oldAbsolutePath, newAbsolutePath)
  }

  reconcileFileRegistryPaths(workspaceId: string) {
    return reconcileFileRegistryPaths(this.db, workspaceId)
  }

  findRegistryByPath(workspaceId: string, absolutePath: string) {
    return findRegistryByPath(this.db, workspaceId, absolutePath)
  }

  findRegistryByDocumentId(documentId: string) {
    return findRegistryByDocumentId(this.db, documentId)
  }

  deleteChunksByDocument(documentId: string, kbId: string) {
    deleteChunksByDocument(this.db, documentId, kbId)
  }

  replaceChunks(documentId: string, kbId: string, rows: CreateChunkInput[]) {
    replaceChunks(this.db, documentId, kbId, rows)
  }

  countChunksByKb(kbId: string) {
    return countChunksByKb(this.db, kbId)
  }

  countChunksByDocument(documentId: string, kbId: string) {
    return countChunksByDocument(this.db, documentId, kbId)
  }

  listChunkTextsByDocument(documentId: string, kbId: string) {
    return listChunkTextsByDocument(this.db, documentId, kbId)
  }

  listChunkRowsByDocument(documentId: string, kbId: string) {
    return listChunkRowsByDocument(this.db, documentId, kbId)
  }

  countAllActiveChunks() {
    return countAllActiveChunks(this.db)
  }

  listAllActiveChunkTexts() {
    return listAllActiveChunkTexts(this.db)
  }

  getChunksByIds(chunkIds: string[]) {
    return getChunksByIds(this.db, chunkIds)
  }

  upsertIngestJob(input: {
    workspaceId: string
    kbId: string
    documentId: string
    stage: DocumentRow['status']
    progress?: number
    errorJson?: string | null
  }) {
    upsertIngestJob(this.db, input)
  }
}

export function createDocumentRepository(db: ToolmanDatabase) {
  return new DocumentRepository(db)
}
