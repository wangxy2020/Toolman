import type { DocumentRow } from '../types/knowledge.js'

export interface CreateDocumentInput {
  id?: string
  kbId: string
  sourceId?: string | null
  title: string
  contentHash?: string | null
  mimeType?: string | null
  status?: DocumentRow['status']
  absolutePath?: string | null
  blobHash?: string | null
  metadataJson?: string
}

export interface CreateChunkInput {
  id: string
  documentId: string
  kbId: string
  chunkIndex: number
  text: string
  tokenCount?: number | null
  metadataJson?: string
}
