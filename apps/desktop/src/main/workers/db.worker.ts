import { parentPort, workerData } from 'node:worker_threads'
import Database from 'better-sqlite3'
import { createChunkFtsRepository, type ChunkFtsRow } from '@toolman/db'

interface DbWorkerRequest {
  id: number
  op: 'fts.replaceDocumentChunks' | 'fts.rebuildAll' | 'fts.appendDocumentChunks'
  payload: {
    documentId?: string
    rows: ChunkFtsRow[]
  }
}

interface DbWorkerResponse {
  id: number
  ok: boolean
  error?: string
}

const dbPath = workerData.dbPath as string
const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')
sqlite.pragma('busy_timeout = 5000')

const ftsRepo = createChunkFtsRepository(sqlite)

parentPort?.on('message', (request: DbWorkerRequest) => {
  void (async () => {
    const respond = (response: DbWorkerResponse) => {
      parentPort?.postMessage(response)
    }

    try {
      switch (request.op) {
        case 'fts.replaceDocumentChunks':
          if (!request.payload.documentId) {
            throw new Error('documentId is required')
          }
          await ftsRepo.replaceDocumentChunksAsync(request.payload.documentId, request.payload.rows)
          break
        case 'fts.rebuildAll':
          await ftsRepo.rebuildAllAsync(request.payload.rows)
          break
        case 'fts.appendDocumentChunks':
          ftsRepo.appendDocumentChunks(request.payload.rows)
          break
        default:
          throw new Error(`unsupported db worker op: ${(request as DbWorkerRequest).op}`)
      }
      respond({ id: request.id, ok: true })
    } catch (error) {
      respond({
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })()
})
