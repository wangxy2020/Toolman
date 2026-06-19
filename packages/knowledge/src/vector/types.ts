import type { VectorRecord, VectorSearchHit } from './cosine.js'

export type VectorBackend = 'file' | 'lance'

export interface VectorStoreMeta {
  dimension: number
  model: string
}

export interface VectorStore {
  upsert(records: VectorRecord[], meta: VectorStoreMeta): Promise<void>
  deleteByDocumentId(documentId: string): Promise<void>
  deleteByKbId(): Promise<void>
  search(queryVector: number[], topK: number, kbId?: string): Promise<VectorSearchHit[]>
}

export interface OpenKbVectorStoreOptions {
  vectorsDir: string
  kbId: string
  backend?: VectorBackend
}
