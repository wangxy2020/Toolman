import {
  KnowledgeSearchInputSchema,
  KnowledgeSearchResultSchema,
  type KnowledgeSearchResult,
} from '@toolman/shared'
import {
  embedTexts,
  fuseHybridResults,
  dedupeByDocument,
  rerankDocuments,
  openKbVectorStore,
  type VectorSearchHit,
} from '@toolman/knowledge'
import { join } from 'node:path'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../../db/repos'
import { getWorkspaceKnowledgeDir } from '../knowledge.service'
import { resolveEmbedConfig, resolveKbScoreThreshold, resolveRerankConfig } from '../knowledge-embed.service'
import { searchChunksFts } from '../knowledge-fts.service'

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
  const fusedHits: Array<{
    chunkId: string
    documentId: string
    score: number
  }> = []

  for (const kb of targetKbs) {
    const embed = resolveEmbedConfig(data.workspaceId, kb.id)
    const perKb = data.kbSettings?.[kb.id]
    const kbTopK = perKb?.topK ?? data.topK
    const scoreThreshold = resolveKbScoreThreshold(
      kb.embedConfigJson,
      perKb?.scoreThreshold ?? data.scoreThreshold,
    )
    const poolSize = Math.min(kbTopK * 4, 40)
    const [queryVector] = await embedTexts(embed.embedOptions, [data.query])
    const store = await openKbVectorStore({
      vectorsDir,
      kbId: kb.id,
      backend: embed.vectorBackend,
    })

    const vectorResults = (await store.search(queryVector, poolSize, kb.id))
      .filter((hit: VectorSearchHit) => hit.score >= scoreThreshold)
      .map((hit) => ({
        chunkId: hit.chunkId,
        documentId: hit.documentId,
        score: hit.score,
      }))

    const ftsResults = hybridEnabled
      ? searchChunksFts([kb.id], data.query, poolSize).map((hit) => ({
          chunkId: hit.chunkId,
          documentId: hit.documentId,
          score: hit.score,
        }))
      : []

    let merged = hybridEnabled
      ? dedupeByDocument(
          fuseHybridResults(vectorResults, ftsResults, {
            topK: poolSize,
            vectorWeight: data.vectorWeight,
            ftsWeight: data.ftsWeight,
          }),
          poolSize,
        )
      : vectorResults

    const rerank = resolveRerankConfig(data.workspaceId, kb.id)
    if (rerank && merged.length > 1) {
      const chunkRows = docRepo.getChunksByIds(merged.map((hit) => hit.chunkId))
      const textByChunkId = new Map(chunkRows.map((row) => [row.id, row.text]))
      const documents = merged.map((hit) => textByChunkId.get(hit.chunkId) ?? '')
      const reranked = await rerankDocuments(
        rerank.rerankOptions,
        data.query,
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

  const sorted = fusedHits.sort((a, b) => b.score - a.score).slice(0, data.topK)
  const hits: KnowledgeSearchResult[] = []

  for (const hit of sorted) {
    const chunks = docRepo.getChunksByIds([hit.chunkId])
    const chunk = chunks[0]
    if (!chunk) continue
    const doc = docRepo.findById(hit.documentId, chunk.kbId)
    if (!doc) continue
    const kb = targetKbs.find((item) => item.id === chunk.kbId)
    if (!kb) continue

    hits.push({
      chunkId: hit.chunkId,
      documentId: hit.documentId,
      documentTitle: doc.title,
      kbId: kb.id,
      kbName: kb.name,
      score: hit.score,
      text: chunk.text,
      sourcePath: doc.absolutePath,
    })
  }

  return hits.map((item) => KnowledgeSearchResultSchema.parse(item))
}
