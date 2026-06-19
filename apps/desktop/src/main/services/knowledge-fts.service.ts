import { getChunkFtsRepository, getDocumentRepository } from '../db/repos'

export function syncDocumentFts(
  documentId: string,
  kbId: string,
  chunkRows: Array<{ id: string; text: string }>,
): void {
  getChunkFtsRepository().replaceDocumentChunks(
    documentId,
    chunkRows.map((row) => ({
      chunkId: row.id,
      kbId,
      documentId,
      text: row.text,
    })),
  )
}

export function removeDocumentFts(documentId: string): void {
  getChunkFtsRepository().removeDocument(documentId)
}

export function removeKbFts(kbId: string): void {
  getChunkFtsRepository().removeKb(kbId)
}

export function searchChunksFts(kbIds: string[], query: string, topK: number) {
  return getChunkFtsRepository().search(kbIds, query, topK)
}

export function rebuildKnowledgeFtsIndex(): { indexed: number } {
  const rows = getDocumentRepository().listAllActiveChunkTexts()
  getChunkFtsRepository().rebuildAll(
    rows.map((row) => ({
      chunkId: row.id,
      kbId: row.kbId,
      documentId: row.documentId,
      text: row.text,
    })),
  )
  return { indexed: rows.length }
}

export function ensureFtsIndexReady(): void {
  const ftsRepo = getChunkFtsRepository()
  const chunkCount = getDocumentRepository().countAllActiveChunks()
  if (chunkCount > 0 && ftsRepo.count() === 0) {
    rebuildKnowledgeFtsIndex()
  }
}
