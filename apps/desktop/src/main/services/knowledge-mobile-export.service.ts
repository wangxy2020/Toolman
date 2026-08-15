/**
 * Export 「同步知识库」documents, chunk text, vectors, and original files
 * for the desktop ↔ mobile Sync Hub snapshot.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  KnowledgeSnapshotSchema,
  encodeFloat32Vector,
  isSyncKnowledgeBaseKind,
  KNOWLEDGE_SNAPSHOT_INLINE_FILE_MAX_BYTES,
  KNOWLEDGE_SNAPSHOT_INLINE_FILE_TOTAL_MAX_BYTES,
  type KnowledgeSnapshot,
  type KnowledgeSnapshotChunk,
  type KnowledgeSnapshotDocument,
  type KnowledgeSnapshotFile,
  type KnowledgeSnapshotKb,
  type KnowledgeSnapshotVector,
} from '@toolman/shared'
import { openKbVectorStore } from '@toolman/knowledge'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../db/repos'
import { getDefaultWorkspace } from './workspace.service'
import { getWorkspaceKnowledgeDir, listKnowledgeBases } from './knowledge.service'
import { listKnowledgeDocuments } from './knowledge-document/list-ingest'
import { logStructured } from './structured-log.service'

function requireWorkspaceId(): string {
  const workspace = getDefaultWorkspace()
  if (!workspace) throw new Error('未找到默认工作区')
  return workspace.id
}

function vectorBackendForKb(embedConfigJson: string | undefined): 'file' | 'lance' {
  try {
    const parsed = JSON.parse(embedConfigJson ?? '{}') as { vectorBackend?: string }
    return parsed.vectorBackend === 'lance' ? 'lance' : 'file'
  } catch {
    return 'file'
  }
}

export async function exportMobileKnowledgeSnapshot(options?: {
  since?: number
}): Promise<KnowledgeSnapshot> {
  const workspaceId = requireWorkspaceId()
  const vectorsDir = join(getWorkspaceKnowledgeDir(workspaceId), 'vectors')
  const kbs = listKnowledgeBases({ workspaceId }).filter((kb) => isSyncKnowledgeBaseKind(kb.kind))
  const kbRepo = getKnowledgeBaseRepository()
  const docRepo = getDocumentRepository()

  const snapshotKbs: KnowledgeSnapshotKb[] = []
  const documents: KnowledgeSnapshotDocument[] = []
  const chunks: KnowledgeSnapshotChunk[] = []
  const vectors: KnowledgeSnapshotVector[] = []
  const files: KnowledgeSnapshotFile[] = []
  let inlinedBytes = 0

  for (const kb of kbs) {
    snapshotKbs.push({
      id: kb.id,
      name: kb.name,
      kind: kb.kind,
      documentCount: kb.documentCount,
      updatedAt: kb.updatedAt,
      embedModel: kb.embedConfig.embedModelId,
      embedDimension: kb.embedConfig.embedDimension,
    })

    const listed = await listKnowledgeDocuments({ kbId: kb.id, workspaceId })
    const since = options?.since
    const needsBodies = listed.some(
      (doc) => since == null || since <= 0 || doc.updatedAt > since,
    )
    const row = kbRepo.findRowById(kb.id, workspaceId) ?? kbRepo.findRowByIdOnly(kb.id)
    const backend = vectorBackendForKb(row?.embedConfigJson)

    let store: Awaited<ReturnType<typeof openKbVectorStore>> | null = null
    if (needsBodies) {
      try {
        store = await openKbVectorStore({ vectorsDir, kbId: kb.id, backend })
      } catch (error) {
        logStructured(
          'mobile-sync',
          'warn',
          `open vector store failed for kb ${kb.id}: ${String(error)}`,
        )
      }
    }

    for (const doc of listed) {
      documents.push({
        id: doc.id,
        kbId: doc.kbId,
        title: doc.title,
        mimeType: doc.mimeType ?? null,
        status: doc.status,
        sourceKind: doc.sourceKind,
        chunkCount: doc.chunkCount,
        sizeBytes: doc.sizeBytes ?? null,
        updatedAt: doc.updatedAt,
      })

      const includeBody = since == null || since <= 0 || doc.updatedAt > since
      if (!includeBody) continue

      for (const chunk of docRepo.listChunkRowsByDocument(doc.id, kb.id)) {
        chunks.push({
          id: chunk.id,
          documentId: doc.id,
          kbId: kb.id,
          chunkIndex: chunk.chunkIndex,
          text: chunk.text,
        })
      }

      if (store) {
        try {
          const records = await store.listByDocumentId(doc.id)
          for (const record of records) {
            const vector = Array.from(record.vector ?? [])
            if (vector.length === 0) continue
            vectors.push({
              chunkId: record.chunkId,
              documentId: record.documentId,
              kbId: record.kbId || kb.id,
              vectorB64: encodeFloat32Vector(vector),
              dimension: vector.length,
            })
          }
        } catch (error) {
          logStructured(
            'mobile-sync',
            'warn',
            `list vectors failed for doc ${doc.id}: ${String(error)}`,
          )
        }
      }

      files.push(readSnapshotFile({
        kbId: kb.id,
        documentId: doc.id,
        title: doc.title,
        mimeType: doc.mimeType ?? null,
        absolutePath: doc.absolutePath ?? null,
        sizeBytes: doc.sizeBytes ?? null,
        inlinedBytes,
      }))
      const last = files[files.length - 1]
      if (last?.contentB64) {
        inlinedBytes += last.sizeBytes
      }
    }
  }

  return KnowledgeSnapshotSchema.parse({
    schemaVersion: 1,
    exportedAt: Date.now(),
    kbs: snapshotKbs,
    documents,
    chunks,
    vectors,
    files,
  })
}

function readSnapshotFile(input: {
  kbId: string
  documentId: string
  title: string
  mimeType: string | null
  absolutePath: string | null
  sizeBytes: number | null
  inlinedBytes: number
}): KnowledgeSnapshotFile {
  const fileName = input.absolutePath ? basename(input.absolutePath) : input.title
  if (!input.absolutePath || !existsSync(input.absolutePath)) {
    return {
      documentId: input.documentId,
      kbId: input.kbId,
      fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes ?? 0,
      omitted: true,
      omitReason: 'missing',
    }
  }

  let sizeBytes = input.sizeBytes ?? 0
  try {
    sizeBytes = statSync(input.absolutePath).size
  } catch {
    // keep listed size
  }

  const overFileCap = sizeBytes > KNOWLEDGE_SNAPSHOT_INLINE_FILE_MAX_BYTES
  const overTotalCap =
    input.inlinedBytes + sizeBytes > KNOWLEDGE_SNAPSHOT_INLINE_FILE_TOTAL_MAX_BYTES
  if (overFileCap || overTotalCap) {
    return {
      documentId: input.documentId,
      kbId: input.kbId,
      fileName,
      mimeType: input.mimeType,
      sizeBytes,
      omitted: true,
      omitReason: overFileCap ? 'too_large' : 'budget',
    }
  }

  try {
    const buf = readFileSync(input.absolutePath)
    return {
      documentId: input.documentId,
      kbId: input.kbId,
      fileName,
      mimeType: input.mimeType,
      sizeBytes: buf.length,
      contentB64: buf.toString('base64'),
    }
  } catch (error) {
    return {
      documentId: input.documentId,
      kbId: input.kbId,
      fileName,
      mimeType: input.mimeType,
      sizeBytes,
      omitted: true,
      omitReason: String(error),
    }
  }
}

export function readMobileSyncKnowledgeFile(input: {
  kbId: string
  documentId: string
}): { bytes: Buffer; mimeType: string; fileName: string } | null {
  const workspaceId = requireWorkspaceId()
  const kbRepo = getKnowledgeBaseRepository()
  const kb = kbRepo.findRowById(input.kbId, workspaceId) ?? kbRepo.findRowByIdOnly(input.kbId)
  if (!kb || !isSyncKnowledgeBaseKind(kb.kind)) return null

  const doc = getDocumentRepository().findById(input.documentId, input.kbId)
  if (!doc?.absolutePath || !existsSync(doc.absolutePath)) return null

  return {
    bytes: readFileSync(doc.absolutePath),
    mimeType: doc.mimeType || 'application/octet-stream',
    fileName: basename(doc.absolutePath),
  }
}
