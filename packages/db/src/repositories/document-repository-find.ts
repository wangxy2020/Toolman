import { and, eq, isNull } from 'drizzle-orm'
import type { ToolmanDatabase } from '../index.js'
import { documents } from '../schema/knowledge.js'
import type { DocumentRow } from '../types/knowledge.js'

export function findDocumentByIdAndKb(
  db: ToolmanDatabase,
  id: string,
  kbId: string,
): DocumentRow | null {
  const row = db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.kbId, kbId)))
    .get()
  if (!row || row.deletedAt) return null
  return row
}

export function findDocumentById(db: ToolmanDatabase, id: string): DocumentRow | null {
  const row = db.select().from(documents).where(eq(documents.id, id)).get()
  if (!row || row.deletedAt) return null
  return row
}

export function findAnyDocumentById(
  db: ToolmanDatabase,
  id: string,
  kbId: string,
): DocumentRow | null {
  const row = db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.kbId, kbId)))
    .get()
  return row ?? null
}

export function findDocumentByPath(
  db: ToolmanDatabase,
  kbId: string,
  absolutePath: string,
): DocumentRow | null {
  const row = db
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

export function findAnyDocumentByPath(
  db: ToolmanDatabase,
  kbId: string,
  absolutePath: string,
): DocumentRow | null {
  const row = db
    .select()
    .from(documents)
    .where(and(eq(documents.kbId, kbId), eq(documents.absolutePath, absolutePath)))
    .get()
  return row ?? null
}

export function restoreDocument(
  db: ToolmanDatabase,
  id: string,
  kbId: string,
): DocumentRow | null {
  const existing = db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.kbId, kbId)))
    .get()
  if (!existing) return null

  db.update(documents)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(and(eq(documents.id, id), eq(documents.kbId, kbId)))
    .run()

  return findDocumentByIdAndKb(db, id, kbId)
}
