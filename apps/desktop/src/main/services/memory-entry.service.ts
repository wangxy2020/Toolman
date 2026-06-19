import {
  MemoryEntryDeleteInputSchema,
  MemoryEntryListInputSchema,
  MemoryEntrySchema,
  type MemoryEntry,
} from '@toolman/shared'
import { getMemoryEntryRepository } from '../db/repos'
import { removeMemoryVector } from './memory-vector.service'

export function listMemoryEntries(input: unknown): MemoryEntry[] {
  const data = MemoryEntryListInputSchema.parse(input)
  const rows = getMemoryEntryRepository().listByWorkspace(data.workspaceId, {
    limit: data.limit ?? 100,
  })

  return rows.map((row) =>
    MemoryEntrySchema.parse({
      id: row.id,
      workspaceId: row.workspaceId,
      assistantId: row.assistantId,
      content: row.content,
      source: row.source,
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    }),
  )
}

export function deleteMemoryEntry(input: unknown): boolean {
  const data = MemoryEntryDeleteInputSchema.parse(input)
  const repo = getMemoryEntryRepository()
  const deleted = repo.softDelete(data.entryId, data.workspaceId)
  if (deleted) {
    removeMemoryVector(data.workspaceId, data.entryId)
  }
  return deleted
}
