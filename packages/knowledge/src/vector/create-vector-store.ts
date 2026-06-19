import { existsSync, unlinkSync } from 'node:fs'
import { FileVectorStore, getKbVectorStorePath } from './file-vector-store.js'
import { LanceVectorStore, migrateJsonVectorsToLance } from './lance-vector-store.js'
import type { OpenKbVectorStoreOptions, VectorStore } from './types.js'

class FileVectorStoreAdapter implements VectorStore {
  constructor(
    private readonly store: FileVectorStore,
    private readonly kbId: string,
    private readonly filePath: string,
  ) {}

  async upsert(
    records: Parameters<FileVectorStore['upsert']>[0],
    meta: Parameters<FileVectorStore['upsert']>[1],
  ): Promise<void> {
    this.store.upsert(records, meta)
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    this.store.deleteByDocumentId(documentId)
  }

  async deleteByKbId(): Promise<void> {
    this.store.deleteByKbId(this.kbId)
    if (existsSync(this.filePath)) {
      unlinkSync(this.filePath)
    }
  }

  async search(
    queryVector: number[],
    topK: number,
    kbId?: string,
  ): Promise<ReturnType<FileVectorStore['search']>> {
    return this.store.search(queryVector, topK, kbId)
  }
}

export async function openKbVectorStore(options: OpenKbVectorStoreOptions): Promise<VectorStore> {
  const backend = options.backend ?? 'file'

  if (backend === 'lance') {
    const lanceDir = `${options.vectorsDir}/lance`.replace(/\/+/g, '/')
    await migrateJsonVectorsToLance({
      vectorsDir: options.vectorsDir,
      kbId: options.kbId,
    })
    return new LanceVectorStore(lanceDir, options.kbId)
  }

  const filePath = getKbVectorStorePath(options.vectorsDir, options.kbId)
  return new FileVectorStoreAdapter(new FileVectorStore(filePath), options.kbId, filePath)
}

export { migrateJsonVectorsToLance }
