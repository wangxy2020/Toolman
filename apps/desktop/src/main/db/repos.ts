import {
  createMessageRepository,
  createSessionRepository,
  createKnowledgeBaseRepository,
  createDocumentRepository,
  createMemoryEntryRepository,
  createChunkFtsRepository,
  type MessageRepository,
  type SessionRepository,
  type KnowledgeBaseRepository,
  type DocumentRepository,
  type MemoryEntryRepository,
} from '@toolman/db'
import { getDatabase } from '../bootstrap/database'
import { getSqliteClient } from '@toolman/db'

let chunkFtsRepo: ReturnType<typeof createChunkFtsRepository> | null = null

/** @internal Resets cached FTS repo between integration tests. */
export function resetChunkFtsRepositoryForTests(): void {
  chunkFtsRepo = null
}

export function getSessionRepository(): SessionRepository {
  return createSessionRepository(getDatabase())
}

export function getMessageRepository(): MessageRepository {
  return createMessageRepository(getDatabase())
}

export function getKnowledgeBaseRepository(): KnowledgeBaseRepository {
  return createKnowledgeBaseRepository(getDatabase())
}

export function getDocumentRepository(): DocumentRepository {
  return createDocumentRepository(getDatabase())
}

export function getMemoryEntryRepository(): MemoryEntryRepository {
  return createMemoryEntryRepository(getDatabase())
}

export function getChunkFtsRepository() {
  if (!chunkFtsRepo) {
    chunkFtsRepo = createChunkFtsRepository(getSqliteClient(getDatabase()))
  }
  return chunkFtsRepo
}
