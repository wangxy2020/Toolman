import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { cosineSimilarity, type VectorRecord, type VectorSearchHit } from './cosine.js'

export type { VectorRecord, VectorSearchHit }

interface StoredVectorFile {
  dimension: number
  model: string
  records: VectorRecord[]
}

export class FileVectorStore {
  constructor(private readonly filePath: string) {}

  load(): StoredVectorFile {
    if (!existsSync(this.filePath)) {
      return { dimension: 0, model: '', records: [] }
    }

    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as StoredVectorFile
      return {
        dimension: parsed.dimension ?? 0,
        model: parsed.model ?? '',
        records: Array.isArray(parsed.records) ? parsed.records : [],
      }
    } catch {
      return { dimension: 0, model: '', records: [] }
    }
  }

  save(data: StoredVectorFile): void {
    const dir = dirname(this.filePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(this.filePath, JSON.stringify(data), 'utf8')
  }

  upsert(records: VectorRecord[], meta: { dimension: number; model: string }): void {
    const current = this.load()
    const map = new Map(current.records.map((record) => [record.chunkId, record]))

    for (const record of records) {
      map.set(record.chunkId, record)
    }

    this.save({
      dimension: meta.dimension || current.dimension,
      model: meta.model || current.model,
      records: [...map.values()],
    })
  }

  deleteByDocumentId(documentId: string): void {
    const current = this.load()
    this.save({
      ...current,
      records: current.records.filter((record) => record.documentId !== documentId),
    })
  }

  deleteByKbId(kbId: string): void {
    const current = this.load()
    this.save({
      ...current,
      records: current.records.filter((record) => record.kbId !== kbId),
    })
  }

  search(queryVector: number[], topK: number, kbId?: string): VectorSearchHit[] {
    const current = this.load()
    const pool = kbId ? current.records.filter((record) => record.kbId === kbId) : current.records

    return pool
      .map((record) => ({
        chunkId: record.chunkId,
        documentId: record.documentId,
        score: cosineSimilarity(record.vector, queryVector),
        metadata: record.metadata,
      }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }
}

export function getKbVectorStorePath(vectorsDir: string, kbId: string): string {
  return `${vectorsDir}/kb_${kbId}.vectors.json`
}

export function getMemoryVectorStorePath(vectorsDir: string): string {
  return `${vectorsDir}/memory.vectors.json`
}

export const MEMORY_VECTOR_KB_ID = '__memory__'
