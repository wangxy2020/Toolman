import { and, desc, eq } from 'drizzle-orm'
import type { ToolmanDatabase } from '../index.js'
import { documentRevisions, documents } from '../schema/knowledge.js'
import type { DocumentRevisionRow } from '../types/knowledge.js'

export interface CreateDocumentRevisionInput {
  id: string
  documentId: string
  kbId: string
  revisionNumber: number
  contentHash?: string | null
  parsedHash?: string | null
  indexFingerprint?: string | null
  indexVersion?: number
  isCurrent?: number
}

export class DocumentRevisionRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  listByDocument(documentId: string): DocumentRevisionRow[] {
    return this.db
      .select()
      .from(documentRevisions)
      .where(eq(documentRevisions.documentId, documentId))
      .orderBy(desc(documentRevisions.revisionNumber))
      .all()
  }

  findCurrent(documentId: string): DocumentRevisionRow | null {
    return (
      this.db
        .select()
        .from(documentRevisions)
        .where(and(eq(documentRevisions.documentId, documentId), eq(documentRevisions.isCurrent, 1)))
        .get() ?? null
    )
  }

  create(input: CreateDocumentRevisionInput): DocumentRevisionRow {
    const now = new Date()
    this.db
      .insert(documentRevisions)
      .values({
        id: input.id,
        documentId: input.documentId,
        kbId: input.kbId,
        revisionNumber: input.revisionNumber,
        contentHash: input.contentHash ?? null,
        parsedHash: input.parsedHash ?? null,
        indexFingerprint: input.indexFingerprint ?? null,
        indexVersion: input.indexVersion ?? 1,
        isCurrent: input.isCurrent ?? 1,
        createdAt: now,
      })
      .run()
    return this.findById(input.id)!
  }

  findById(id: string): DocumentRevisionRow | null {
    return this.db.select().from(documentRevisions).where(eq(documentRevisions.id, id)).get() ?? null
  }

  markCurrent(documentId: string, revisionId: string): void {
    this.db
      .update(documentRevisions)
      .set({ isCurrent: 0 })
      .where(eq(documentRevisions.documentId, documentId))
      .run()
    this.db
      .update(documentRevisions)
      .set({ isCurrent: 1 })
      .where(eq(documentRevisions.id, revisionId))
      .run()
    this.db
      .update(documents)
      .set({ currentRevisionId: revisionId, updatedAt: new Date() })
      .where(eq(documents.id, documentId))
      .run()
  }
}

export function createDocumentRevisionRepository(db: ToolmanDatabase) {
  return new DocumentRevisionRepository(db)
}
