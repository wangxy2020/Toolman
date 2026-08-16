import { and, asc, eq, isNull } from 'drizzle-orm'
import type { ToolmanDatabase } from '../index.js'
import { chunks } from '../schema/knowledge.js'
import type { ChunkRow } from '../types/knowledge.js'
import type { CreateChunkInput } from './document-repository-types.js'

export function deleteChunksByDocument(
  db: ToolmanDatabase,
  documentId: string,
  kbId: string,
): void {
  db.delete(chunks)
    .where(and(eq(chunks.documentId, documentId), eq(chunks.kbId, kbId)))
    .run()
}

export function replaceChunks(
  db: ToolmanDatabase,
  documentId: string,
  kbId: string,
  rows: CreateChunkInput[],
): void {
  deleteChunksByDocument(db, documentId, kbId)

  const now = new Date()
  for (const row of rows) {
    db.insert(chunks)
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

export function countChunksByKb(db: ToolmanDatabase, kbId: string): number {
  return db
    .select()
    .from(chunks)
    .where(and(eq(chunks.kbId, kbId), isNull(chunks.deletedAt)))
    .all().length
}

export function countChunksByDocument(
  db: ToolmanDatabase,
  documentId: string,
  kbId: string,
): number {
  return db
    .select()
    .from(chunks)
    .where(
      and(eq(chunks.documentId, documentId), eq(chunks.kbId, kbId), isNull(chunks.deletedAt)),
    )
    .all().length
}

export function listChunkRowsByDocument(
  db: ToolmanDatabase,
  documentId: string,
  kbId: string,
): Array<{ id: string; text: string; chunkIndex: number }> {
  return db
    .select({
      id: chunks.id,
      text: chunks.text,
      chunkIndex: chunks.chunkIndex,
    })
    .from(chunks)
    .where(
      and(eq(chunks.documentId, documentId), eq(chunks.kbId, kbId), isNull(chunks.deletedAt)),
    )
    .orderBy(asc(chunks.chunkIndex))
    .all()
    .map((row) => ({ id: row.id, text: row.text, chunkIndex: row.chunkIndex }))
}

export function listChunkTextsByDocument(
  db: ToolmanDatabase,
  documentId: string,
  kbId: string,
): string[] {
  return listChunkRowsByDocument(db, documentId, kbId).map((row) => row.text)
}

export function countAllActiveChunks(db: ToolmanDatabase): number {
  return db.select().from(chunks).where(isNull(chunks.deletedAt)).all().length
}

export function listAllActiveChunkTexts(
  db: ToolmanDatabase,
): Array<{ id: string; kbId: string; documentId: string; text: string }> {
  return db
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

export function getChunksByIds(db: ToolmanDatabase, chunkIds: string[]): ChunkRow[] {
  if (chunkIds.length === 0) return []
  const rows: ChunkRow[] = []
  for (const chunkId of chunkIds) {
    const row = db.select().from(chunks).where(eq(chunks.id, chunkId)).get()
    if (row && !row.deletedAt) rows.push(row)
  }
  return rows
}
