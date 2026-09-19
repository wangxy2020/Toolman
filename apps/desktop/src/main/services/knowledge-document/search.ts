import {
  KnowledgeSearchInputSchema,
  KnowledgeSearchResultSchema,
  mergeKnowledgeRetrievalConfig,
  type KnowledgeSearchResult,
} from '@toolman/shared'
import {
  embedTexts,
  fuseHybridResults,
  dedupeByDocument,
  rerankDocuments,
  openKbVectorStore,
  enhanceQueryForKnowledgeSearch,
  extractPdfPageQueryHint,
  extractDocumentTitleQueryHint,
  extractChapterQueryHint,
  documentTitleMatchesQuery,
  chunkTextMatchesChapter,
  parseChunkMetadata,
  type VectorSearchHit,
  type FusedSearchHit,
} from '@toolman/knowledge'
import { join } from 'node:path'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../../db/repos'
import { getWorkspaceKnowledgeDir } from '../knowledge.service'
import { resolveEmbedConfig, resolveKbScoreThreshold, resolveRerankConfig } from '../knowledge-embed.service'
import { searchChunksFts } from '../knowledge-fts.service'
import { resolveActiveIndexVersion } from '../knowledge-index-version.service'

function chunkTextMatchesPage(
  docRepo: ReturnType<typeof getDocumentRepository>,
  chunkId: string,
  pageNumber: number,
): boolean {
  const chunk = docRepo.getChunksByIds([chunkId])[0]
  if (!chunk) return false

  if (new RegExp(`【第\\s*${pageNumber}(?!\\d)\\s*页`).test(chunk.text)) {
    return true
  }

  try {
    const metadata = JSON.parse(chunk.metadataJson) as { pageNumber?: unknown }
    return metadata.pageNumber === pageNumber
  } catch {
    return false
  }
}

function rankSearchHitScore(
  docRepo: ReturnType<typeof getDocumentRepository>,
  hit: { chunkId: string; documentId: string; score: number },
  options: {
    pageQueryHint: number | null
    documentTitleHint: string | null
    titleWeight: number
    titleMismatchPenalty: number
    pageWeight: number
    pageMismatchPenalty: number
    chapterHint: ReturnType<typeof extractChapterQueryHint>
  },
): number {
  let score = hit.score
  const chunk = docRepo.getChunksByIds([hit.chunkId])[0]
  if (!chunk) return score

  const doc = docRepo.findById(hit.documentId, chunk.kbId)
  const docTitle = doc?.title ?? ''
  const docMatches = options.documentTitleHint
    ? documentTitleMatchesQuery(docTitle, options.documentTitleHint)
    : null
  const pageMatches = options.pageQueryHint
    ? chunkTextMatchesPage(docRepo, hit.chunkId, options.pageQueryHint)
    : null
  const chapterMatches = options.chapterHint
    ? chunkTextMatchesChapter(chunk.text, options.chapterHint)
    : null

  if (options.documentTitleHint) {
    score += docMatches ? options.titleWeight : -options.titleMismatchPenalty
  }
  if (options.pageQueryHint) {
    if (pageMatches) {
      score += options.pageWeight
    } else if (docMatches) {
      score -= options.pageMismatchPenalty
    }
  }
  // Chapter body chunks often omit the heading; boost hits, but never penalize the rest.
  if (options.chapterHint && chapterMatches) {
    score += options.pageWeight
  }

  return score
}

function hitDocumentTitle(
  docRepo: ReturnType<typeof getDocumentRepository>,
  hit: { chunkId: string; documentId: string },
): string {
  const chunk = docRepo.getChunksByIds([hit.chunkId])[0]
  if (!chunk) return ''
  const doc = docRepo.findById(hit.documentId, chunk.kbId)
  return doc?.title ?? ''
}

export async function searchKnowledge(input: unknown): Promise<KnowledgeSearchResult[]> {
  const data = KnowledgeSearchInputSchema.parse(input)
  const kbRepo = getKnowledgeBaseRepository()
  const allKbs = kbRepo.listByWorkspace(data.workspaceId)
  const targetKbs = data.kbIds?.length
    ? allKbs.filter((kb) => data.kbIds!.includes(kb.id))
    : allKbs

  if (targetKbs.length === 0) return []

  const docRepo = getDocumentRepository()
  const vectorsDir = join(getWorkspaceKnowledgeDir(data.workspaceId), 'vectors')
  const hybridEnabled = data.hybridEnabled !== false
  const pageQueryHint = extractPdfPageQueryHint(data.query)
  const chapterQueryHint = extractChapterQueryHint(data.query)
  const documentTitleHint = extractDocumentTitleQueryHint(data.query)
  const searchQuery = enhanceQueryForKnowledgeSearch(data.query)
  const useFocusedRanking =
    pageQueryHint !== null || documentTitleHint !== null || chapterQueryHint !== null
  const focusedFloor = chapterQueryHint ? 16 : 10
  const effectiveTopK = useFocusedRanking ? Math.max(data.topK, focusedFloor) : data.topK
  const fusedHits: Array<{
    chunkId: string
    documentId: string
    score: number
  }> = []

  for (const kb of targetKbs) {
    const embed = resolveEmbedConfig(data.workspaceId, kb.id)
    const retrieval = mergeKnowledgeRetrievalConfig(kb.retrievalConfigJson, {
      vectorWeight: data.vectorWeight,
      ftsWeight: data.ftsWeight,
    })
    const perKb = data.kbSettings?.[kb.id]
    const kbTopK = perKb?.topK ?? effectiveTopK
    const scoreThreshold = resolveKbScoreThreshold(
      kb.embedConfigJson,
      perKb?.scoreThreshold ?? data.scoreThreshold ?? retrieval.scoreThreshold,
    )
    const poolSize = Math.min(kbTopK * 4, 40)
    const [queryVector] = await embedTexts(embed.embedOptions, [searchQuery])
    const store = await openKbVectorStore({
      vectorsDir,
      kbId: kb.id,
      backend: embed.vectorBackend,
      indexVersion: resolveActiveIndexVersion(data.workspaceId, kb.id),
    })

    const vectorResults = (await store.search(queryVector, poolSize, kb.id))
      .filter((hit: VectorSearchHit) => hit.score >= scoreThreshold)
      .map((hit) => ({
        chunkId: hit.chunkId,
        documentId: hit.documentId,
        score: hit.score,
      }))

    const ftsResults = hybridEnabled
      ? searchChunksFts([kb.id], searchQuery, poolSize).map((hit) => ({
          chunkId: hit.chunkId,
          documentId: hit.documentId,
          score: hit.score,
        }))
      : []

    let merged: FusedSearchHit[] = hybridEnabled
      ? fuseHybridResults(vectorResults, ftsResults, {
          topK: poolSize,
          vectorWeight: retrieval.vectorWeight,
          ftsWeight: retrieval.ftsWeight,
        })
      : vectorResults.map((hit) => ({
          ...hit,
          vectorScore: hit.score,
          ftsScore: 0,
        }))

    if (!useFocusedRanking) {
      merged = dedupeByDocument(merged, poolSize)
    } else {
      merged = merged.slice(0, poolSize)
    }

    const rerank = resolveRerankConfig(data.workspaceId, kb.id)
    if (rerank && merged.length > 1) {
      const chunkRows = docRepo.getChunksByIds(merged.map((hit) => hit.chunkId))
      const textByChunkId = new Map(chunkRows.map((row) => [row.id, row.text]))
      const documents = merged.map((hit) => textByChunkId.get(hit.chunkId) ?? '')
      const reranked = await rerankDocuments(
        rerank.rerankOptions,
        searchQuery,
        documents,
        poolSize,
      )
      merged = reranked.map((item) => ({
        ...merged[item.index]!,
        score: item.score,
      }))
    }

    for (const hit of merged) {
      fusedHits.push({
        chunkId: hit.chunkId,
        documentId: hit.documentId,
        score: hit.score,
      })
    }
  }

  let sorted = fusedHits
    .map((hit) => {
      const chunk = docRepo.getChunksByIds([hit.chunkId])[0]
      const kb = chunk ? targetKbs.find((item) => item.id === chunk.kbId) : undefined
      const retrieval = mergeKnowledgeRetrievalConfig(kb?.retrievalConfigJson, {
        vectorWeight: data.vectorWeight,
        ftsWeight: data.ftsWeight,
      })
      return {
        ...hit,
        score: rankSearchHitScore(docRepo, hit, {
          pageQueryHint,
          documentTitleHint,
          titleWeight: retrieval.titleWeight,
          titleMismatchPenalty: retrieval.titleMismatchPenalty,
          pageWeight: retrieval.pageWeight,
          pageMismatchPenalty: retrieval.pageMismatchPenalty,
          chapterHint: chapterQueryHint,
        }),
      }
    })
    .sort((a, b) => b.score - a.score)

  if (documentTitleHint) {
    const matching = sorted.filter((hit) =>
      documentTitleMatchesQuery(hitDocumentTitle(docRepo, hit), documentTitleHint),
    )
    if (matching.length > 0) {
      sorted = matching
    }
  }

  sorted = sorted.slice(0, effectiveTopK)
  const hits: KnowledgeSearchResult[] = []

  for (const hit of sorted) {
    const chunks = docRepo.getChunksByIds([hit.chunkId])
    const chunk = chunks[0]
    if (!chunk) continue
    const doc = docRepo.findById(hit.documentId, chunk.kbId)
    if (!doc) continue
    const kb = targetKbs.find((item) => item.id === chunk.kbId)
    if (!kb) continue

    const metadata = parseChunkMetadata(chunk.metadataJson)
    const fileName = metadata.fileName ?? doc.title

    hits.push({
      chunkId: hit.chunkId,
      documentId: hit.documentId,
      documentTitle: doc.title,
      kbId: kb.id,
      kbName: kb.name,
      score: hit.score,
      text: chunk.text,
      sourcePath: doc.absolutePath,
      ...(metadata.pageNumber != null ? { pageNumber: metadata.pageNumber } : {}),
      ...(metadata.heading ? { heading: metadata.heading } : {}),
      chunkIndex: chunk.chunkIndex,
      sourceType: metadata.sourceType ?? (doc.absolutePath?.startsWith('http') ? 'url' : 'file'),
      fileName,
      revisionId: chunk.revisionId ?? doc.currentRevisionId,
    })
  }

  return hits.map((item) => KnowledgeSearchResultSchema.parse(item))
}
