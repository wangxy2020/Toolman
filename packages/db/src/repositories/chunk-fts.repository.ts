import type Database from 'better-sqlite3'

export interface ChunkFtsRow {
  chunkId: string
  kbId: string
  documentId: string
  text: string
}

export interface ChunkFtsHit {
  chunkId: string
  documentId: string
  kbId: string
  score: number
}

function buildFtsMatchQuery(query: string): string | null {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/"/g, '""'))
    .filter((token) => token.length > 0)

  if (tokens.length === 0) return null
  return tokens.map((token) => `"${token}"`).join(' OR ')
}

export class ChunkFtsRepository {
  constructor(private readonly sqlite: Database.Database) {}

  replaceDocumentChunks(documentId: string, rows: ChunkFtsRow[]): void {
    this.sqlite.prepare('DELETE FROM chunks_fts WHERE document_id = ?').run(documentId)

    if (rows.length === 0) return

    const insert = this.sqlite.prepare(
      'INSERT INTO chunks_fts (chunk_id, kb_id, document_id, text) VALUES (?, ?, ?, ?)',
    )
    const insertMany = this.sqlite.transaction((batch: ChunkFtsRow[]) => {
      for (const row of batch) {
        insert.run(row.chunkId, row.kbId, row.documentId, row.text)
      }
    })
    insertMany(rows)
  }

  removeDocument(documentId: string): void {
    this.sqlite.prepare('DELETE FROM chunks_fts WHERE document_id = ?').run(documentId)
  }

  removeKb(kbId: string): void {
    this.sqlite.prepare('DELETE FROM chunks_fts WHERE kb_id = ?').run(kbId)
  }

  clearAll(): void {
    this.sqlite.prepare('DELETE FROM chunks_fts').run()
  }

  count(): number {
    const row = this.sqlite.prepare('SELECT COUNT(*) as count FROM chunks_fts').get() as {
      count: number
    }
    return row.count
  }

  rebuildAll(rows: ChunkFtsRow[]): void {
    this.clearAll()
    if (rows.length === 0) return

    const insert = this.sqlite.prepare(
      'INSERT INTO chunks_fts (chunk_id, kb_id, document_id, text) VALUES (?, ?, ?, ?)',
    )
    const insertMany = this.sqlite.transaction((batch: ChunkFtsRow[]) => {
      for (const row of batch) {
        insert.run(row.chunkId, row.kbId, row.documentId, row.text)
      }
    })
    insertMany(rows)
  }

  search(kbIds: string[], query: string, limit: number): ChunkFtsHit[] {
    const match = buildFtsMatchQuery(query)
    if (!match || kbIds.length === 0) return []

    const placeholders = kbIds.map(() => '?').join(', ')
    const sql = `
      SELECT chunk_id, document_id, kb_id, bm25(chunks_fts) AS rank
      FROM chunks_fts
      WHERE chunks_fts MATCH ?
        AND kb_id IN (${placeholders})
      ORDER BY rank
      LIMIT ?
    `

    const rows = this.sqlite.prepare(sql).all(match, ...kbIds, limit) as Array<{
      chunk_id: string
      document_id: string
      kb_id: string
      rank: number
    }>

    return rows.map((row) => {
      const normalized = 1 / (1 + Math.max(0, row.rank))
      return {
        chunkId: row.chunk_id,
        documentId: row.document_id,
        kbId: row.kb_id,
        score: normalized,
      }
    })
  }
}

export function createChunkFtsRepository(sqlite: Database.Database) {
  return new ChunkFtsRepository(sqlite)
}
