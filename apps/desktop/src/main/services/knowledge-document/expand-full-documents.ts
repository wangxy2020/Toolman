import { extractPdfPageQueryHint } from '@toolman/knowledge'
import type { KnowledgeSearchResult } from '@toolman/shared'
import { getDocumentRepository } from '../../db/repos'

/** Default RAG hit count when assistant/send options omit kbTopK. */
export const DEFAULT_KNOWLEDGE_CHAT_TOP_K = 16

/** Max documents to expand into full indexed text per turn. */
export const FULL_DOCUMENT_EXPAND_MAX_DOCS = 2

/** Byte budget for expanded full-document text (UTF-8). */
export const FULL_DOCUMENT_EXPAND_MAX_BYTES = 384 * 1024

function truncateUtf8(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const trimmed = text.trim()
  const bytes = Buffer.byteLength(trimmed, 'utf8')
  if (bytes <= maxBytes) return { text: trimmed, truncated: false }
  const slice = Buffer.from(trimmed, 'utf8').subarray(0, maxBytes).toString('utf8')
  return { text: `${slice.trimEnd()}\n\n…(全文已截断)`, truncated: true }
}

function rankDocumentsForExpand(hits: KnowledgeSearchResult[]): Array<{
  documentId: string
  kbId: string
  maxScore: number
  hitCount: number
  sample: KnowledgeSearchResult
}> {
  const byDoc = new Map<
    string,
    { documentId: string; kbId: string; maxScore: number; hitCount: number; sample: KnowledgeSearchResult }
  >()
  for (const hit of hits) {
    const existing = byDoc.get(hit.documentId)
    if (!existing) {
      byDoc.set(hit.documentId, {
        documentId: hit.documentId,
        kbId: hit.kbId,
        maxScore: hit.score,
        hitCount: 1,
        sample: hit,
      })
      continue
    }
    existing.hitCount += 1
    if (hit.score > existing.maxScore) {
      existing.maxScore = hit.score
      existing.sample = hit
    }
  }
  return [...byDoc.values()].sort((a, b) => {
    if (b.maxScore !== a.maxScore) return b.maxScore - a.maxScore
    return b.hitCount - a.hitCount
  })
}

/**
 * After vector/FTS retrieval, prefer injecting full indexed text for the top
 * matched documents instead of only a handful of sparse chunks.
 * Skips expansion when the query targets a specific PDF page.
 */
export function expandKnowledgeHitsWithFullDocuments(
  hits: KnowledgeSearchResult[],
  query: string,
  options?: {
    maxDocuments?: number
    maxBytes?: number
  },
): KnowledgeSearchResult[] {
  if (hits.length === 0) return hits
  if (extractPdfPageQueryHint(query) != null) return hits

  const maxDocuments = Math.max(1, options?.maxDocuments ?? FULL_DOCUMENT_EXPAND_MAX_DOCS)
  const maxBytes = Math.max(8 * 1024, options?.maxBytes ?? FULL_DOCUMENT_EXPAND_MAX_BYTES)
  const ranked = rankDocumentsForExpand(hits).slice(0, maxDocuments)
  const expandedIds = new Set(ranked.map((item) => item.documentId))
  const repo = getDocumentRepository()

  const expanded: KnowledgeSearchResult[] = []
  let remainingBytes = maxBytes

  for (const item of ranked) {
    if (remainingBytes < 1024) break
    const texts = repo
      .listChunkTextsByDocument(item.documentId, item.kbId)
      .map((text) => text.trim())
      .filter(Boolean)
    if (texts.length === 0) continue

    const joined = texts.join('\n\n')
    const { text, truncated } = truncateUtf8(joined, remainingBytes)
    if (!text) continue
    remainingBytes -= Buffer.byteLength(text, 'utf8')

    const sample = item.sample
    expanded.push({
      chunkId: `full:${item.documentId}`,
      documentId: item.documentId,
      documentTitle: sample.documentTitle,
      kbId: sample.kbId,
      kbName: sample.kbName,
      score: item.maxScore,
      text: truncated
        ? text
        : `【全文 ${texts.length} 块】\n${text}`,
      sourcePath: sample.sourcePath,
      sourceType: sample.sourceType,
      fileName: sample.fileName,
      revisionId: sample.revisionId,
      chunkIndex: 0,
    })
  }

  if (expanded.length === 0) return hits

  // Keep a few sparse hits from other documents for breadth.
  const others = hits
    .filter((hit) => !expandedIds.has(hit.documentId))
    .slice(0, Math.max(4, DEFAULT_KNOWLEDGE_CHAT_TOP_K - expanded.length))

  return [...expanded, ...others]
}
