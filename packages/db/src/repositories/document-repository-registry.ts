import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { and, eq } from 'drizzle-orm'
import type { ToolmanDatabase } from '../index.js'
import { documents, fileRegistry } from '../schema/knowledge.js'

export function findRegistryByPath(
  db: ToolmanDatabase,
  workspaceId: string,
  absolutePath: string,
) {
  const normalizedPath = resolve(absolutePath)
  return (
    db
      .select()
      .from(fileRegistry)
      .where(
        and(
          eq(fileRegistry.workspaceId, workspaceId),
          eq(fileRegistry.absolutePath, normalizedPath),
        ),
      )
      .get() ?? null
  )
}

export function findRegistryByDocumentId(db: ToolmanDatabase, documentId: string) {
  return (
    db.select().from(fileRegistry).where(eq(fileRegistry.documentId, documentId)).get() ?? null
  )
}

export function upsertFileRegistry(
  db: ToolmanDatabase,
  input: {
    workspaceId: string
    absolutePath: string
    contentHash: string
    sizeBytes: number
    mtimeMs: number
    documentId?: string | null
  },
) {
  const now = new Date()
  const normalizedPath = resolve(input.absolutePath)
  const existing = db
    .select()
    .from(fileRegistry)
    .where(
      and(
        eq(fileRegistry.workspaceId, input.workspaceId),
        eq(fileRegistry.absolutePath, normalizedPath),
      ),
    )
    .get()

  if (existing) {
    db.update(fileRegistry)
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
  db.insert(fileRegistry)
    .values({
      id,
      workspaceId: input.workspaceId,
      absolutePath: normalizedPath,
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

export function renameFileRegistryPath(
  db: ToolmanDatabase,
  workspaceId: string,
  oldAbsolutePath: string,
  newAbsolutePath: string,
): void {
  const oldPath = resolve(oldAbsolutePath)
  const newPath = resolve(newAbsolutePath)
  if (oldPath === newPath) return

  const existing = findRegistryByPath(db, workspaceId, oldPath)
  if (!existing) return

  const conflict = findRegistryByPath(db, workspaceId, newPath)
  if (conflict && conflict.id !== existing.id) {
    db.delete(fileRegistry).where(eq(fileRegistry.id, existing.id)).run()
    return
  }

  db.update(fileRegistry)
    .set({ absolutePath: newPath, updatedAt: new Date() })
    .where(eq(fileRegistry.id, existing.id))
    .run()
}

export function reconcileFileRegistryPaths(db: ToolmanDatabase, workspaceId: string): number {
  const rows = db
    .select()
    .from(fileRegistry)
    .where(eq(fileRegistry.workspaceId, workspaceId))
    .all()

  let fixed = 0
  for (const row of rows) {
    if (!row.documentId) continue

    const doc = db.select().from(documents).where(eq(documents.id, row.documentId)).get()
    if (!doc?.absolutePath || doc.deletedAt) continue

    const registryPath = resolve(row.absolutePath)
    const docPath = resolve(doc.absolutePath)
    if (registryPath === docPath) continue

    const canonical = findRegistryByPath(db, workspaceId, docPath)
    if (canonical && canonical.id !== row.id) {
      db.delete(fileRegistry).where(eq(fileRegistry.id, row.id)).run()
      fixed += 1
      continue
    }

    db.update(fileRegistry)
      .set({ absolutePath: docPath, updatedAt: new Date() })
      .where(eq(fileRegistry.id, row.id))
      .run()
    fixed += 1
  }

  return fixed
}
