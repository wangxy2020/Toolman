import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import type { ToolmanDatabase } from '../index.js'
import {
  chunks,
  documents,
  documentSources,
  fileRegistry,
  ingestJobs,
  knowledgeBases,
} from '../schema/knowledge.js'
import type { ChunkRow, DocumentRow, DocumentSourceRow } from '../types/knowledge.js'

export interface CreateDocumentInput {
  id?: string
  kbId: string
  sourceId?: string | null
  title: string
  contentHash?: string | null
  mimeType?: string | null
  status?: DocumentRow['status']
  absolutePath?: string | null
  blobHash?: string | null
  metadataJson?: string
}

export interface CreateChunkInput {
  id: string
  documentId: string
  kbId: string
  chunkIndex: number
  text: string
  tokenCount?: number | null
  metadataJson?: string
}

export class DocumentRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  findById(id: string, kbId: string): DocumentRow | null {
    const row = this.db
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.kbId, kbId)))
      .get()
    if (!row || row.deletedAt) return null
    return row
  }

  findDocumentById(id: string): DocumentRow | null {
    const row = this.db.select().from(documents).where(eq(documents.id, id)).get()
    if (!row || row.deletedAt) return null
    return row
  }

  findByPath(kbId: string, absolutePath: string): DocumentRow | null {
    const row = this.db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.kbId, kbId),
          eq(documents.absolutePath, absolutePath),
          isNull(documents.deletedAt),
        ),
      )
      .get()
    return row ?? null
  }

  findAnyByPath(kbId: string, absolutePath: string): DocumentRow | null {
    const row = this.db
      .select()
      .from(documents)
      .where(and(eq(documents.kbId, kbId), eq(documents.absolutePath, absolutePath)))
      .get()
    return row ?? null
  }

  restoreDocument(id: string, kbId: string): DocumentRow | null {
    const existing = this.db
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.kbId, kbId)))
      .get()
    if (!existing) return null

    this.db
      .update(documents)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(eq(documents.id, id), eq(documents.kbId, kbId)))
      .run()

    return this.findById(id, kbId)
  }

  listByKb(kbId: string): DocumentRow[] {
    return this.db
      .select()
      .from(documents)
      .where(and(eq(documents.kbId, kbId), isNull(documents.deletedAt)))
      .orderBy(desc(documents.updatedAt))
      .all()
  }

  listUrlDocumentsByKb(kbId: string): DocumentRow[] {
    return this.db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.kbId, kbId),
          isNull(documents.deletedAt),
          or(
            sql`${documents.absolutePath} LIKE 'http://%'`,
            sql`${documents.absolutePath} LIKE 'https://%'`,
          ),
        ),
      )
      .orderBy(desc(documents.updatedAt))
      .all()
  }

  listResumableDocuments(workspaceId?: string): Array<{
    job: typeof ingestJobs.$inferSelect
    document: DocumentRow
  }> {
    const pendingStages = ['queued', 'parsing', 'chunking', 'embedding', 'indexing'] as const
    const rows = this.db
      .select({
        job: ingestJobs,
        document: documents,
      })
      .from(ingestJobs)
      .innerJoin(documents, eq(ingestJobs.documentId, documents.id))
      .where(
        and(
          inArray(ingestJobs.stage, [...pendingStages]),
          isNull(documents.deletedAt),
          workspaceId ? eq(ingestJobs.workspaceId, workspaceId) : undefined,
        ),
      )
      .orderBy(desc(ingestJobs.createdAt))
      .all()

    return rows
  }

  listPendingIngestJobs(options: {
    workspaceId: string
    kbId?: string
    includeFailed?: boolean
  }): Array<{
    job: typeof ingestJobs.$inferSelect
    document: DocumentRow
  }> {
    const pendingStages = ['queued', 'parsing', 'chunking', 'embedding', 'indexing'] as const
    const stages = options.includeFailed ? [...pendingStages, 'failed' as const] : [...pendingStages]
    return this.db
      .select({
        job: ingestJobs,
        document: documents,
      })
      .from(ingestJobs)
      .innerJoin(documents, eq(ingestJobs.documentId, documents.id))
      .where(
        and(
          eq(ingestJobs.workspaceId, options.workspaceId),
          options.kbId ? eq(ingestJobs.kbId, options.kbId) : undefined,
          inArray(ingestJobs.stage, stages),
          isNull(documents.deletedAt),
        ),
      )
      .orderBy(desc(ingestJobs.createdAt))
      .all()
  }

  listFileRegistryByWorkspace(
    workspaceId: string,
    options?: { limit?: number },
  ): Array<{
    registry: typeof fileRegistry.$inferSelect
    document: DocumentRow | null
    kbName: string | null
  }> {
    const rows = this.db
      .select({
        registry: fileRegistry,
        document: documents,
        kbName: knowledgeBases.name,
      })
      .from(fileRegistry)
      .leftJoin(documents, eq(fileRegistry.documentId, documents.id))
      .leftJoin(knowledgeBases, eq(documents.kbId, knowledgeBases.id))
      .where(eq(fileRegistry.workspaceId, workspaceId))
      .orderBy(desc(fileRegistry.updatedAt))
      .all()

    return rows.slice(0, options?.limit ?? 500)
  }

  create(input: CreateDocumentInput): DocumentRow {
    const now = new Date()
    const id = input.id ?? randomUUID()

    this.db
      .insert(documents)
      .values({
        id,
        kbId: input.kbId,
        sourceId: input.sourceId ?? null,
        title: input.title,
        contentHash: input.contentHash ?? null,
        mimeType: input.mimeType ?? null,
        status: input.status ?? 'queued',
        absolutePath: input.absolutePath ?? null,
        blobHash: input.blobHash ?? null,
        metadataJson: input.metadataJson ?? '{}',
        createdAt: now,
        updatedAt: now,
      })
      .run()

    return this.findById(id, input.kbId)!
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
  ): DocumentRow | null {
    const existing = this.findById(id, kbId)
    if (!existing) return null

    this.db
      .update(documents)
      .set({
        title: patch.title ?? existing.title,
        contentHash: patch.contentHash !== undefined ? patch.contentHash : existing.contentHash,
        mimeType: patch.mimeType !== undefined ? patch.mimeType : existing.mimeType,
        status: patch.status ?? existing.status,
        errorJson: patch.errorJson !== undefined ? patch.errorJson : existing.errorJson,
        metadataJson: patch.metadataJson ?? existing.metadataJson,
        absolutePath: patch.absolutePath !== undefined ? patch.absolutePath : existing.absolutePath,
        blobHash: patch.blobHash !== undefined ? patch.blobHash : existing.blobHash,
        updatedAt: new Date(),
      })
      .where(and(eq(documents.id, id), eq(documents.kbId, kbId)))
      .run()

    return this.findById(id, kbId)
  }

  softDelete(id: string, kbId: string): boolean {
    const existing = this.findById(id, kbId)
    if (!existing) return false

    this.db
      .update(documents)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(documents.id, id), eq(documents.kbId, kbId)))
      .run()

    return true
  }

  countByKb(kbId: string): number {
    return this.listByKb(kbId).length
  }

  createSource(input: {
    kbId: string
    type: typeof documentSources.$inferInsert.type
    uri: string
    configJson?: string
  }): DocumentSourceRow {
    const now = new Date()
    const id = randomUUID()
    this.db
      .insert(documentSources)
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
    return this.getSourceById(id, input.kbId)!
  }

  getSourceById(id: string, kbId: string): DocumentSourceRow | null {
    const row = this.db
      .select()
      .from(documentSources)
      .where(and(eq(documentSources.id, id), eq(documentSources.kbId, kbId)))
      .get()
    if (!row || row.deletedAt) return null
    return row
  }

  findSourceByUri(kbId: string, uri: string): DocumentSourceRow | null {
    const row = this.db
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

  listSourcesByKb(kbId: string): DocumentSourceRow[] {
    return this.db
      .select()
      .from(documentSources)
      .where(and(eq(documentSources.kbId, kbId), isNull(documentSources.deletedAt)))
      .orderBy(desc(documentSources.updatedAt))
      .all()
  }

  softDeleteSource(id: string, kbId: string): boolean {
    const existing = this.getSourceById(id, kbId)
    if (!existing) return false

    this.db
      .update(documentSources)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(documentSources.id, id), eq(documentSources.kbId, kbId)))
      .run()

    return true
  }

  softDeleteAllByKb(kbId: string): void {
    const now = new Date()
    this.db
      .update(documents)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(documents.kbId, kbId), isNull(documents.deletedAt)))
      .run()
  }

  softDeleteAllSourcesByKb(kbId: string): void {
    const now = new Date()
    this.db
      .update(documentSources)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(documentSources.kbId, kbId), isNull(documentSources.deletedAt)))
      .run()
  }

  softDeleteAllChunksByKb(kbId: string): void {
    const now = new Date()
    this.db
      .update(chunks)
      .set({ deletedAt: now })
      .where(and(eq(chunks.kbId, kbId), isNull(chunks.deletedAt)))
      .run()
  }

  clearRegistryForDocumentIds(documentIds: string[]): void {
    if (documentIds.length === 0) return
    this.db
      .delete(fileRegistry)
      .where(inArray(fileRegistry.documentId, documentIds))
      .run()
  }

  pruneOrphanedFileRegistry(workspaceId: string): number {
    const orphans = this.db
      .select({ id: fileRegistry.id })
      .from(fileRegistry)
      .leftJoin(documents, eq(fileRegistry.documentId, documents.id))
      .where(
        and(
          eq(fileRegistry.workspaceId, workspaceId),
          or(
            isNull(fileRegistry.documentId),
            isNull(documents.id),
            sql`${documents.deletedAt} IS NOT NULL`,
          ),
        ),
      )
      .all()

    if (orphans.length === 0) return 0

    const orphanIds = orphans.map((row) => row.id)
    this.db.delete(fileRegistry).where(inArray(fileRegistry.id, orphanIds)).run()
    return orphanIds.length
  }

  deleteIngestJobsByKb(kbId: string): void {
    this.db.delete(ingestJobs).where(eq(ingestJobs.kbId, kbId)).run()
  }

  deleteIngestJobByDocumentId(documentId: string): void {
    this.db.delete(ingestJobs).where(eq(ingestJobs.documentId, documentId)).run()
  }

  listActiveDocumentIdsByKb(kbId: string): string[] {
    return this.listByKb(kbId).map((row) => row.id)
  }

  upsertFileRegistry(input: {
    workspaceId: string
    absolutePath: string
    contentHash: string
    sizeBytes: number
    mtimeMs: number
    documentId?: string | null
  }) {
    const now = new Date()
    const existing = this.db
      .select()
      .from(fileRegistry)
      .where(
        and(
          eq(fileRegistry.workspaceId, input.workspaceId),
          eq(fileRegistry.absolutePath, input.absolutePath),
        ),
      )
      .get()

    if (existing) {
      this.db
        .update(fileRegistry)
        .set({
          contentHash: input.contentHash,
          sizeBytes: input.sizeBytes,
          mtimeMs: input.mtimeMs,
          documentId: input.documentId ?? existing.documentId,
          updatedAt: now,
        })
        .where(eq(fileRegistry.id, existing.id))
        .run()
      return existing.id
    }

    const id = randomUUID()
    this.db
      .insert(fileRegistry)
      .values({
        id,
        workspaceId: input.workspaceId,
        absolutePath: input.absolutePath,
        contentHash: input.contentHash,
        sizeBytes: input.sizeBytes,
        mtimeMs: input.mtimeMs,
        documentId: input.documentId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    return id
  }

  findRegistryByPath(workspaceId: string, absolutePath: string) {
    return (
      this.db
        .select()
        .from(fileRegistry)
        .where(
          and(
            eq(fileRegistry.workspaceId, workspaceId),
            eq(fileRegistry.absolutePath, absolutePath),
          ),
        )
        .get() ?? null
    )
  }

  findRegistryByDocumentId(documentId: string) {
    return (
      this.db
        .select()
        .from(fileRegistry)
        .where(eq(fileRegistry.documentId, documentId))
        .get() ?? null
    )
  }

  replaceChunks(documentId: string, kbId: string, rows: CreateChunkInput[]): void {
    this.db
      .update(chunks)
      .set({ deletedAt: new Date() })
      .where(and(eq(chunks.documentId, documentId), eq(chunks.kbId, kbId), isNull(chunks.deletedAt)))
      .run()

    const now = new Date()
    for (const row of rows) {
      this.db
        .insert(chunks)
        .values({
          id: row.id,
          documentId: row.documentId,
          kbId: row.kbId,
          chunkIndex: row.chunkIndex,
          text: row.text,
          tokenCount: row.tokenCount ?? null,
          metadataJson: row.metadataJson ?? '{}',
          createdAt: now,
        })
        .run()
    }
  }

  countChunksByKb(kbId: string): number {
    return this.db
      .select()
      .from(chunks)
      .where(and(eq(chunks.kbId, kbId), isNull(chunks.deletedAt)))
      .all().length
  }

  countChunksByDocument(documentId: string, kbId: string): number {
    return this.db
      .select()
      .from(chunks)
      .where(
        and(
          eq(chunks.documentId, documentId),
          eq(chunks.kbId, kbId),
          isNull(chunks.deletedAt),
        ),
      )
      .all().length
  }

  listChunkTextsByDocument(documentId: string, kbId: string): string[] {
    return this.db
      .select({
        text: chunks.text,
        chunkIndex: chunks.chunkIndex,
      })
      .from(chunks)
      .where(
        and(
          eq(chunks.documentId, documentId),
          eq(chunks.kbId, kbId),
          isNull(chunks.deletedAt),
        ),
      )
      .orderBy(asc(chunks.chunkIndex))
      .all()
      .map((row) => row.text)
  }

  countAllActiveChunks(): number {
    return this.db.select().from(chunks).where(isNull(chunks.deletedAt)).all().length
  }

  listAllActiveChunkTexts(): Array<{ id: string; kbId: string; documentId: string; text: string }> {
    return this.db
      .select({
        id: chunks.id,
        kbId: chunks.kbId,
        documentId: chunks.documentId,
        text: chunks.text,
      })
      .from(chunks)
      .where(isNull(chunks.deletedAt))
      .all()
  }

  getChunksByIds(chunkIds: string[]): ChunkRow[] {
    if (chunkIds.length === 0) return []
    const rows: ChunkRow[] = []
    for (const chunkId of chunkIds) {
      const row = this.db.select().from(chunks).where(eq(chunks.id, chunkId)).get()
      if (row && !row.deletedAt) rows.push(row)
    }
    return rows
  }

  private mapDocumentStageToJobStage(
    stage: DocumentRow['status'],
  ): (typeof ingestJobs.$inferSelect)['stage'] {
    if (stage === 'ready') return 'done'
    if (
      stage === 'queued' ||
      stage === 'parsing' ||
      stage === 'chunking' ||
      stage === 'embedding' ||
      stage === 'indexing' ||
      stage === 'failed'
    ) {
      return stage
    }
    return 'queued'
  }

  upsertIngestJob(input: {
    workspaceId: string
    kbId: string
    documentId: string
    stage: DocumentRow['status']
    progress?: number
    errorJson?: string | null
  }): void {
    const now = new Date()
    const jobStage = this.mapDocumentStageToJobStage(input.stage)
    const existing = this.db
      .select()
      .from(ingestJobs)
      .where(eq(ingestJobs.documentId, input.documentId))
      .get()

    const patch = {
      stage: jobStage,
      progress: input.progress ?? existing?.progress ?? 0,
      errorJson: input.errorJson ?? existing?.errorJson ?? null,
      startedAt: existing?.startedAt ?? (jobStage === 'queued' ? null : now),
      finishedAt:
        jobStage === 'done' || jobStage === 'failed'
          ? now
          : (existing?.finishedAt ?? null),
    }

    if (existing) {
      this.db
        .update(ingestJobs)
        .set(patch)
        .where(eq(ingestJobs.id, existing.id))
        .run()
      return
    }

    this.db
      .insert(ingestJobs)
      .values({
        id: randomUUID(),
        documentId: input.documentId,
        kbId: input.kbId,
        workspaceId: input.workspaceId,
        stage: jobStage,
        progress: patch.progress,
        errorJson: patch.errorJson,
        startedAt: jobStage === 'queued' ? null : now,
        finishedAt: patch.finishedAt,
        createdAt: now,
      })
      .run()
  }
}

export function createDocumentRepository(db: ToolmanDatabase) {
  return new DocumentRepository(db)
}
