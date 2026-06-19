import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { connect, type Connection, type Table } from '@lancedb/lancedb'
import type { VectorRecord, VectorSearchHit } from './cosine.js'
import { FileVectorStore, getKbVectorStorePath } from './file-vector-store.js'
import type { VectorStore, VectorStoreMeta } from './types.js'

const connectionCache = new Map<string, Promise<Connection>>()

function tableName(kbId: string): string {
  return `kb_${kbId.replace(/-/g, '_')}`
}

function lanceDirFor(vectorsDir: string): string {
  return join(vectorsDir, 'lance')
}

async function getConnection(lanceDir: string): Promise<Connection> {
  if (!existsSync(lanceDir)) {
    mkdirSync(lanceDir, { recursive: true })
  }

  let pending = connectionCache.get(lanceDir)
  if (!pending) {
    pending = connect(lanceDir)
    connectionCache.set(lanceDir, pending)
  }
  return pending
}

function toLanceRow(record: VectorRecord) {
  return {
    chunk_id: record.chunkId,
    document_id: record.documentId,
    kb_id: record.kbId,
    vector: record.vector,
    title: String(record.metadata?.title ?? ''),
    file_path: String(record.metadata?.filePath ?? ''),
  }
}

export async function migrateJsonVectorsToLance(options: {
  vectorsDir: string
  kbId: string
}): Promise<boolean> {
  const jsonPath = getKbVectorStorePath(options.vectorsDir, options.kbId)
  if (!existsSync(jsonPath)) return false

  const fileStore = new FileVectorStore(jsonPath)
  const data = fileStore.load()
  if (data.records.length === 0) {
    renameSync(jsonPath, `${jsonPath}.migrated`)
    return false
  }

  const store = new LanceVectorStore(lanceDirFor(options.vectorsDir), options.kbId)
  await store.upsert(data.records, {
    dimension: data.dimension,
    model: data.model,
  })
  renameSync(jsonPath, `${jsonPath}.migrated`)
  return true
}

export class LanceVectorStore implements VectorStore {
  constructor(
    private readonly lanceRoot: string,
    private readonly kbId: string,
  ) {}

  private async openTable(createIfMissing: boolean): Promise<Table | null> {
    const conn = await getConnection(this.lanceRoot)
    const name = tableName(this.kbId)
    const names = await conn.tableNames()
    if (names.includes(name)) {
      return conn.openTable(name)
    }
    if (!createIfMissing) return null
    return null
  }

  async upsert(records: VectorRecord[], meta: VectorStoreMeta): Promise<void> {
    if (records.length === 0) return

    const conn = await getConnection(this.lanceRoot)
    const name = tableName(this.kbId)
    const rows = records.map(toLanceRow)
    const names = await conn.tableNames()

    if (!names.includes(name)) {
      await conn.createTable(name, rows, {
        mode: 'create',
      })
      return
    }

    const table = await conn.openTable(name)
    const documentIds = [...new Set(records.map((record) => record.documentId))]
    for (const documentId of documentIds) {
      await table.delete(`document_id = '${documentId}'`)
    }
    await table.add(rows)

    void meta
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    const table = await this.openTable(false)
    if (!table) return
    await table.delete(`document_id = '${documentId}'`)
  }

  async deleteByKbId(): Promise<void> {
    const conn = await getConnection(this.lanceRoot)
    const name = tableName(this.kbId)
    const names = await conn.tableNames()
    if (!names.includes(name)) return
    await conn.dropTable(name)
  }

  async search(queryVector: number[], topK: number, kbId?: string): Promise<VectorSearchHit[]> {
    const table = await this.openTable(false)
    if (!table) return []

    const filterKb = kbId ?? this.kbId
    const results = await table
      .vectorSearch(queryVector)
      .distanceType('cosine')
      .where(`kb_id = '${filterKb}'`)
      .limit(topK)
      .toArray()

    return results.map((row) => {
      const distance = typeof row._distance === 'number' ? row._distance : 0
      return {
        chunkId: String(row.chunk_id),
        documentId: String(row.document_id),
        score: Math.max(0, 1 - distance),
        metadata: {
          title: String(row.title ?? ''),
          filePath: String(row.file_path ?? ''),
        },
      }
    })
  }
}
