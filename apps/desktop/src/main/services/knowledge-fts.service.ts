import { getChunkFtsRepository, getDocumentRepository } from '../db/repos'
import {
  appendDocumentChunksInWorker,
  rebuildFtsIndexInWorker,
  replaceDocumentChunksInWorker,
} from './db-worker.service'

const FTS_WORKER_ROW_THRESHOLD = 100

function toFtsRows(
  documentId: string,
  kbId: string,
  chunkRows: Array<{ id: string; text: string }>,
) {
  return chunkRows.map((row) => ({
    chunkId: row.id,
    kbId,
    documentId,
    text: row.text,
  }))
}

export async function syncDocumentFts(
  documentId: string,
  kbId: string,
  chunkRows: Array<{ id: string; text: string }>,
): Promise<void> {
  const rows = toFtsRows(documentId, kbId, chunkRows)
  if (rows.length >= FTS_WORKER_ROW_THRESHOLD) {
    const workerTask = replaceDocumentChunksInWorker(documentId, rows)
    if (workerTask) {
      await workerTask
      return
    }
  }
  await getChunkFtsRepository().replaceDocumentChunksAsync(documentId, rows)
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

export async function rebuildKnowledgeFtsIndex(): Promise<{ indexed: number }> {
  const rows = getDocumentRepository().listAllActiveChunkTexts()
  const ftsRows = rows.map((row) => ({
    chunkId: row.id,
    kbId: row.kbId,
    documentId: row.documentId,
    text: row.text,
  }))
  const workerTask = rebuildFtsIndexInWorker(ftsRows)
  if (workerTask) {
    await workerTask
  } else {
    await getChunkFtsRepository().rebuildAllAsync(ftsRows)
  }
  return { indexed: rows.length }
}

export async function appendDocumentFts(
  documentId: string,
  kbId: string,
  chunkRows: Array<{ id: string; text: string }>,
): Promise<void> {
  const rows = toFtsRows(documentId, kbId, chunkRows)
  if (rows.length >= FTS_WORKER_ROW_THRESHOLD) {
    const workerTask = appendDocumentChunksInWorker(rows)
    if (workerTask) {
      await workerTask
      return
    }
  }
  getChunkFtsRepository().appendDocumentChunks(rows)
}

export function ensureFtsIndexReady(): void {
  const ftsRepo = getChunkFtsRepository()
  const chunkCount = getDocumentRepository().countAllActiveChunks()
  if (chunkCount > 0 && ftsRepo.count() === 0) {
    void rebuildKnowledgeFtsIndex().catch(() => undefined)
  }
}
