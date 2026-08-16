import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import type { ToolmanDatabase } from '../index.js'
import { documents, fileRegistry, ingestJobs, knowledgeBases } from '../schema/knowledge.js'
import type { DocumentRow } from '../types/knowledge.js'

export function listDocumentsByKb(db: ToolmanDatabase, kbId: string): DocumentRow[] {
  return db
    .select()
    .from(documents)
    .where(and(eq(documents.kbId, kbId), isNull(documents.deletedAt)))
    .orderBy(desc(documents.updatedAt))
    .all()
}

export function listUrlDocumentsByKb(db: ToolmanDatabase, kbId: string): DocumentRow[] {
  return db
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

export function listResumableDocuments(
  db: ToolmanDatabase,
  workspaceId?: string,
): Array<{
  job: typeof ingestJobs.$inferSelect
  document: DocumentRow
}> {
  const pendingStages = ['queued', 'parsing', 'chunking', 'embedding', 'indexing'] as const
  return db
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
}

export function listPendingIngestJobs(
  db: ToolmanDatabase,
  options: {
    workspaceId: string
    kbId?: string
    includeFailed?: boolean
  },
): Array<{
  job: typeof ingestJobs.$inferSelect
  document: DocumentRow
}> {
  const pendingStages = ['queued', 'parsing', 'chunking', 'embedding', 'indexing'] as const
  const stages = options.includeFailed ? [...pendingStages, 'failed' as const] : [...pendingStages]
  return db
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

export function listFileRegistryByWorkspace(
  db: ToolmanDatabase,
  workspaceId: string,
  options?: { limit?: number },
): Array<{
  registry: typeof fileRegistry.$inferSelect
  document: DocumentRow | null
  kbName: string | null
}> {
  const rows = db
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

export function countDocumentsByKb(db: ToolmanDatabase, kbId: string): number {
  return listDocumentsByKb(db, kbId).length
}

export function listActiveDocumentIdsByKb(db: ToolmanDatabase, kbId: string): string[] {
  return listDocumentsByKb(db, kbId).map((row) => row.id)
}
