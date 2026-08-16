import { randomUUID } from 'node:crypto'
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import type { ToolmanDatabase } from '../index.js'
import {
  documents,
  fileRegistry,
  ingestJobs,
  knowledgeBases,
} from '../schema/knowledge.js'
import type { DocumentRow } from '../types/knowledge.js'
import { listActiveDocumentIdsByKb } from './document-repository-list.js'
import {
  softDeleteAllChunksByKb,
  softDeleteAllDocumentsByKb,
  softDeleteAllSourcesByKb,
} from './document-repository-mutate.js'

export function clearRegistryForDocumentIds(db: ToolmanDatabase, documentIds: string[]): void {
  if (documentIds.length === 0) return
  db.delete(fileRegistry).where(inArray(fileRegistry.documentId, documentIds)).run()
}

export function deleteIngestJobsByKb(db: ToolmanDatabase, kbId: string): void {
  db.delete(ingestJobs).where(eq(ingestJobs.kbId, kbId)).run()
}

export function deleteIngestJobByDocumentId(db: ToolmanDatabase, documentId: string): void {
  db.delete(ingestJobs).where(eq(ingestJobs.documentId, documentId)).run()
}

export function findIngestJobByDocumentId(
  db: ToolmanDatabase,
  documentId: string,
): typeof ingestJobs.$inferSelect | undefined {
  return db.select().from(ingestJobs).where(eq(ingestJobs.documentId, documentId)).get()
}

export function pruneOrphanedFileRegistry(db: ToolmanDatabase, workspaceId: string): number {
  // Soft-deleted KBs may still own live documents (e.g. incomplete duplicate-KB cleanup).
  // Soft-delete those documents first so the orphan query below can clear their registry rows.
  const ghostKbIds = db
    .selectDistinct({ id: knowledgeBases.id })
    .from(knowledgeBases)
    .innerJoin(documents, eq(documents.kbId, knowledgeBases.id))
    .where(
      and(
        eq(knowledgeBases.workspaceId, workspaceId),
        sql`${knowledgeBases.deletedAt} IS NOT NULL`,
        isNull(documents.deletedAt),
      ),
    )
    .all()
    .map((row) => row.id)

  for (const kbId of ghostKbIds) {
    const documentIds = listActiveDocumentIdsByKb(db, kbId)
    clearRegistryForDocumentIds(db, documentIds)
    deleteIngestJobsByKb(db, kbId)
    softDeleteAllChunksByKb(db, kbId)
    softDeleteAllSourcesByKb(db, kbId)
    softDeleteAllDocumentsByKb(db, kbId)
  }

  const orphans = db
    .select({ id: fileRegistry.id })
    .from(fileRegistry)
    .leftJoin(documents, eq(fileRegistry.documentId, documents.id))
    .leftJoin(knowledgeBases, eq(documents.kbId, knowledgeBases.id))
    .where(
      and(
        eq(fileRegistry.workspaceId, workspaceId),
        or(
          isNull(fileRegistry.documentId),
          isNull(documents.id),
          sql`${documents.deletedAt} IS NOT NULL`,
          sql`${knowledgeBases.deletedAt} IS NOT NULL`,
        ),
      ),
    )
    .all()

  if (orphans.length === 0) return ghostKbIds.length > 0 ? 1 : 0

  const orphanIds = orphans.map((row) => row.id)
  db.delete(fileRegistry).where(inArray(fileRegistry.id, orphanIds)).run()
  return orphanIds.length
}

function mapDocumentStageToJobStage(
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

export function upsertIngestJob(
  db: ToolmanDatabase,
  input: {
    workspaceId: string
    kbId: string
    documentId: string
    stage: DocumentRow['status']
    progress?: number
    errorJson?: string | null
  },
): void {
  const now = new Date()
  const jobStage = mapDocumentStageToJobStage(input.stage)
  const existing = db
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
      jobStage === 'done' || jobStage === 'failed' ? now : (existing?.finishedAt ?? null),
  }

  if (existing) {
    db.update(ingestJobs).set(patch).where(eq(ingestJobs.id, existing.id)).run()
    return
  }

  db.insert(ingestJobs)
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
