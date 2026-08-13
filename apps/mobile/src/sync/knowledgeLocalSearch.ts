import type { KnowledgeSnapshot } from '@toolman/shared'

export type LocalKnowledgeHit = {
  documentTitle: string
  kbName: string
  score: number
  text: string
  sourcePath?: string | null
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,，。；;:：!！?？、]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

export function searchKnowledgeSnapshot(
  snapshot: KnowledgeSnapshot,
  query: string,
  options?: { kbId?: string | null; limit?: number },
): LocalKnowledgeHit[] {
  const terms = tokenize(query)
  if (terms.length === 0) return []

  const kbNameById = new Map(snapshot.kbs.map((kb) => [kb.id, kb.name]))
  const titleByDoc = new Map(snapshot.documents.map((doc) => [doc.id, doc.title]))
  const limit = options?.limit ?? 8
  const kbId = options?.kbId ?? null

  const scored: LocalKnowledgeHit[] = []
  for (const chunk of snapshot.chunks) {
    if (kbId && chunk.kbId !== kbId) continue
    const haystack = chunk.text.toLowerCase()
    let hits = 0
    for (const term of terms) {
      if (haystack.includes(term)) hits += 1
    }
    if (hits === 0) continue
    scored.push({
      documentTitle: titleByDoc.get(chunk.documentId) ?? '未命名',
      kbName: kbNameById.get(chunk.kbId) ?? '同步知识库',
      score: hits / terms.length,
      text: chunk.text.slice(0, 480),
    })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}
