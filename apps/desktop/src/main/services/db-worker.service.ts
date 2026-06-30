import { Worker } from 'node:worker_threads'
import type { ChunkFtsRow } from '@toolman/db'
import { resolveMainWorkerScript } from '../lib/resolve-main-worker'

type DbWorkerOp = 'fts.replaceDocumentChunks' | 'fts.rebuildAll' | 'fts.appendDocumentChunks'

interface DbWorkerRequest {
  id: number
  op: DbWorkerOp
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

let worker: Worker | null = null
let nextRequestId = 1
const pending = new Map<number, { resolve: () => void; reject: (error: Error) => void }>()

function ensureWorker(dbPath: string): Worker | null {
  if (worker) return worker

  const workerPath = resolveMainWorkerScript('db.worker.js')
  if (!workerPath) return null

  worker = new Worker(workerPath, { workerData: { dbPath } })
  worker.on('message', (response: DbWorkerResponse) => {
    const waiter = pending.get(response.id)
    if (!waiter) return
    pending.delete(response.id)
    if (response.ok) {
      waiter.resolve()
      return
    }
    waiter.reject(new Error(response.error ?? 'db worker failed'))
  })
  worker.on('error', (error) => {
    for (const [, waiter] of pending) {
      waiter.reject(error instanceof Error ? error : new Error(String(error)))
    }
    pending.clear()
    worker = null
  })
  return worker
}

function runDbWorkerOp(
  op: DbWorkerOp,
  payload: DbWorkerRequest['payload'],
  dbPath: string,
): Promise<void> | null {
  const activeWorker = ensureWorker(dbPath)
  if (!activeWorker) return null

  const id = nextRequestId
  nextRequestId += 1

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    activeWorker.postMessage({ id, op, payload } satisfies DbWorkerRequest)
  })
}

let configuredDbPath: string | null = null

export function initDbWorker(dbPath: string): void {
  configuredDbPath = dbPath
}

function requireDbPath(): string {
  if (!configuredDbPath) {
    throw new Error('db worker is not initialized')
  }
  return configuredDbPath
}

export function replaceDocumentChunksInWorker(
  documentId: string,
  rows: ChunkFtsRow[],
): Promise<void> | null {
  return runDbWorkerOp('fts.replaceDocumentChunks', { documentId, rows }, requireDbPath())
}

export function rebuildFtsIndexInWorker(rows: ChunkFtsRow[]): Promise<void> | null {
  return runDbWorkerOp('fts.rebuildAll', { rows }, requireDbPath())
}

export function appendDocumentChunksInWorker(rows: ChunkFtsRow[]): Promise<void> | null {
  return runDbWorkerOp('fts.appendDocumentChunks', { rows }, requireDbPath())
}

export async function shutdownDbWorker(): Promise<void> {
  if (!worker) return
  const activeWorker = worker
  worker = null
  await activeWorker.terminate()
}
