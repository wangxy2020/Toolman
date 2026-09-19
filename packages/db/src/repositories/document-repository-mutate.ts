import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import type { ToolmanDatabase } from '../index.js'
import { chunks, documents, documentRevisions, documentSources, ingestJobs } from '../schema/knowledge.js'
import type { DocumentRow, DocumentSourceRow } from '../types/knowledge.js'
import type { CreateDocumentInput } from './document-repository-types.js'
import { findDocumentByIdAndKb } from './document-repository-find.js'

export function createDocument(db: ToolmanDatabase, input: CreateDocumentInput): DocumentRow {
  const now = new Date()
  const id = input.id ?? randomUUID()

  db.insert(documents)
    .values({
      id,
      kbId: input.kbId,
      sourceId: input.sourceId ?? null,
      title: input.title,
      contentHash: input.contentHash ?? null,
      parsedHash: input.parsedHash ?? null,
      mimeType: input.mimeType ?? null,
      status: input.status ?? 'queued',
      absolutePath: input.absolutePath ?? null,
      blobHash: input.blobHash ?? null,
      metadataJson: input.metadataJson ?? '{}',
      revisionNumber: input.revisionNumber ?? 1,
      currentRevisionId: input.currentRevisionId ?? null,
      indexVersion: input.indexVersion ?? 1,
      indexFingerprint: input.indexFingerprint ?? null,
      createdAt: now,
      updatedAt: now,
    })
      .run()

  const revisionId = input.currentRevisionId ?? `${id}:rev:1`
  db.insert(documentRevisions)
    .values({
      id: revisionId,
      documentId: id,
      kbId: input.kbId,
      revisionNumber: input.revisionNumber ?? 1,
      contentHash: input.contentHash ?? null,
      parsedHash: input.parsedHash ?? null,
      indexFingerprint: input.indexFingerprint ?? null,
      indexVersion: input.indexVersion ?? 1,
      isCurrent: 1,
      createdAt: now,
    })
    .run()

  if (!input.currentRevisionId) {
    db.update(documents)
      .set({ currentRevisionId: revisionId, updatedAt: now })
      .where(and(eq(documents.id, id), eq(documents.kbId, input.kbId)))
      .run()
  }

  return findDocumentByIdAndKb(db, id, input.kbId)!
}

export function updateDocument(
  db: ToolmanDatabase,
  id: string,
  kbId: string,
  patch: Partial<{
    title: string
    contentHash: string | null
    parsedHash: string | null
    mimeType: string | null
    status: DocumentRow['status']
    errorJson: string | null
    metadataJson: string
    absolutePath: string | null
    blobHash: string | null
    revisionNumber: number
    currentRevisionId: string | null
    indexVersion: number
    indexFingerprint: string | null
  }>,
): DocumentRow | null {
  const existing = findDocumentByIdAndKb(db, id, kbId)
  if (!existing) return null

  db.update(documents)
    .set({
      title: patch.title ?? existing.title,
      contentHash: patch.contentHash !== undefined ? patch.contentHash : existing.contentHash,
      parsedHash: patch.parsedHash !== undefined ? patch.parsedHash : existing.parsedHash,
      mimeType: patch.mimeType !== undefined ? patch.mimeType : existing.mimeType,
      status: patch.status ?? existing.status,
      errorJson: patch.errorJson !== undefined ? patch.errorJson : existing.errorJson,
      metadataJson: patch.metadataJson ?? existing.metadataJson,
      absolutePath: patch.absolutePath !== undefined ? patch.absolutePath : existing.absolutePath,
      blobHash: patch.blobHash !== undefined ? patch.blobHash : existing.blobHash,
      revisionNumber: patch.revisionNumber ?? existing.revisionNumber,
      currentRevisionId:
        patch.currentRevisionId !== undefined ? patch.currentRevisionId : existing.currentRevisionId,
      indexVersion: patch.indexVersion ?? existing.indexVersion,
      indexFingerprint:
        patch.indexFingerprint !== undefined ? patch.indexFingerprint : existing.indexFingerprint,
      updatedAt: new Date(),
    })
    .where(and(eq(documents.id, id), eq(documents.kbId, kbId)))
    .run()

  return findDocumentByIdAndKb(db, id, kbId)
}

export function reassignDocumentKb(
  db: ToolmanDatabase,
  input: {
    documentId: string
    fromKbId: string
    toKbId: string
    absolutePath: string
    sourceId: string | null
  },
): boolean {
  const existing = findDocumentByIdAndKb(db, input.documentId, input.fromKbId)
  if (!existing) return false

  const now = new Date()
  db.update(documents)
    .set({
      kbId: input.toKbId,
      sourceId: input.sourceId,
      absolutePath: input.absolutePath,
      updatedAt: now,
    })
    .where(and(eq(documents.id, input.documentId), eq(documents.kbId, input.fromKbId)))
    .run()

  db.update(chunks).set({ kbId: input.toKbId }).where(eq(chunks.documentId, input.documentId)).run()

  db.update(ingestJobs)
    .set({ kbId: input.toKbId })
    .where(eq(ingestJobs.documentId, input.documentId))
    .run()

  return true
}

export function softDeleteDocument(db: ToolmanDatabase, id: string, kbId: string): boolean {
  const existing = findDocumentByIdAndKb(db, id, kbId)
  if (!existing) return false

  db.update(documents)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(documents.id, id), eq(documents.kbId, kbId)))
    .run()

  return true
}

export function updateDocumentSource(
  db: ToolmanDatabase,
  id: string,
  kbId: string,
  patch: Partial<{
    configJson: string
    contentHash: string | null
    fetchedAt: Date | null
    httpStatus: number | null
    etag: string | null
    lastModified: string | null
    uri: string
  }>,
): DocumentSourceRow | null {
  const existing = getDocumentSourceById(db, id, kbId)
  if (!existing) return null

  db.update(documentSources)
    .set({
      configJson: patch.configJson ?? existing.configJson,
      contentHash: patch.contentHash !== undefined ? patch.contentHash : existing.contentHash,
      fetchedAt: patch.fetchedAt !== undefined ? patch.fetchedAt : existing.fetchedAt,
      httpStatus: patch.httpStatus !== undefined ? patch.httpStatus : existing.httpStatus,
      etag: patch.etag !== undefined ? patch.etag : existing.etag,
      lastModified: patch.lastModified !== undefined ? patch.lastModified : existing.lastModified,
      uri: patch.uri ?? existing.uri,
      updatedAt: new Date(),
    })
    .where(and(eq(documentSources.id, id), eq(documentSources.kbId, kbId)))
    .run()

  return getDocumentSourceById(db, id, kbId)
}

export function createDocumentSource(
  db: ToolmanDatabase,
  input: {
    kbId: string
    type: typeof documentSources.$inferInsert.type
    uri: string
    configJson?: string
  },
): DocumentSourceRow {
  const now = new Date()
  const id = randomUUID()
  db.insert(documentSources)
    .values({
      id,
      kbId: input.kbId,
      type: input.type,
      uri: input.uri,
      configJson: input.configJson ?? '{}',
      createdAt: now,
      updatedAt: now,
    })
    .run()
  return getDocumentSourceById(db, id, input.kbId)!
}

export function getDocumentSourceById(
  db: ToolmanDatabase,
  id: string,
  kbId: string,
): DocumentSourceRow | null {
  const row = db
    .select()
    .from(documentSources)
    .where(and(eq(documentSources.id, id), eq(documentSources.kbId, kbId)))
    .get()
  if (!row || row.deletedAt) return null
  return row
}

export function findDocumentSourceByUri(
  db: ToolmanDatabase,
  kbId: string,
  uri: string,
): DocumentSourceRow | null {
  const row = db
    .select()
    .from(documentSources)
    .where(
      and(
        eq(documentSources.kbId, kbId),
        eq(documentSources.uri, uri),
        isNull(documentSources.deletedAt),
      ),
    )
    .get()
  return row ?? null
}

export function listDocumentSourcesByKb(db: ToolmanDatabase, kbId: string): DocumentSourceRow[] {
  return db
    .select()
    .from(documentSources)
    .where(and(eq(documentSources.kbId, kbId), isNull(documentSources.deletedAt)))
    .orderBy(desc(documentSources.updatedAt))
    .all()
}

export function softDeleteDocumentSource(db: ToolmanDatabase, id: string, kbId: string): boolean {
  const existing = getDocumentSourceById(db, id, kbId)
  if (!existing) return false

  db.update(documentSources)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(documentSources.id, id), eq(documentSources.kbId, kbId)))
    .run()

  return true
}

export function softDeleteAllDocumentsByKb(db: ToolmanDatabase, kbId: string): void {
  const now = new Date()
  db.update(documents)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(documents.kbId, kbId), isNull(documents.deletedAt)))
    .run()
}

export function softDeleteAllSourcesByKb(db: ToolmanDatabase, kbId: string): void {
  const now = new Date()
  db.update(documentSources)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(documentSources.kbId, kbId), isNull(documentSources.deletedAt)))
    .run()
}

export function softDeleteAllChunksByKb(db: ToolmanDatabase, kbId: string): void {
  const now = new Date()
  db.update(chunks)
    .set({ deletedAt: now })
    .where(and(eq(chunks.kbId, kbId), isNull(chunks.deletedAt)))
    .run()
}
