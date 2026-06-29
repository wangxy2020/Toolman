import { MAX_COMMENT_ANCHOR_ATTEMPTS } from './docx-review-types'

export function normalizeAnchorText(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

export function dedupeAnchorTexts(values: Iterable<string>): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const value of values) {
    const normalized = normalizeAnchorText(value)
    if (normalized.length < 2 || seen.has(normalized)) continue
    seen.add(normalized)
    ordered.push(normalized)
  }
  return ordered
}

export function isCommentAnchorNotFoundFailure(result: string): boolean {
  return /ANCHOR_NOT_FOUND|未找到|not found|Anchor text not found/i.test(result)
}

export function buildCommentAnchorCandidates(anchorText: string): string[] {
  const seeds = new Set<string>()
  const normalized = normalizeAnchorText(anchorText)
  if (normalized) seeds.add(normalized)

  for (const part of anchorText.split(/\n+/)) {
    const line = normalizeAnchorText(part)
    if (line.length >= 2) seeds.add(line)
  }

  const candidates: string[] = []
  for (const seed of seeds) {
    candidates.push(seed)
    if (seed.length > 60) candidates.push(seed.slice(0, 60))
    if (seed.length > 40) candidates.push(seed.slice(0, 40))
    if (seed.length > 24) candidates.push(seed.slice(0, 24))
    if (seed.length > 12) candidates.push(seed.slice(0, 12))
    if (seed.length > 8) candidates.push(seed.slice(0, 8))
    if (seed.length > 6) candidates.push(seed.slice(0, 6))
    if (seed.length > 4) candidates.push(seed.slice(0, 4))
  }

  return [...new Set(candidates.filter((candidate) => candidate.length >= 2))]
}

/** 当模型 anchor 在文档中不存在时，用子串 / 分词 seed 通过 search_text 反查真实锚点 */
export function buildCommentSearchSeeds(anchorText: string): string[] {
  const seeds = new Set<string>()

  for (const candidate of buildCommentAnchorCandidates(anchorText)) {
    seeds.add(candidate)
  }

  const normalized = normalizeAnchorText(anchorText)
  for (const part of normalized.split(/[，。；：、！？（）()\[\]《》""''\s]+/)) {
    const clause = part.trim()
    if (clause.length < 2) continue
    seeds.add(clause)
    for (const len of [16, 12, 8, 6, 4, 3, 2]) {
      if (clause.length >= len) seeds.add(clause.slice(0, len))
    }
  }

  const han = normalized.replace(/[^\u4e00-\u9fff]/g, '')
  for (const len of [6, 5, 4, 3, 2]) {
    for (let i = 0; i <= han.length - len; i++) {
      seeds.add(han.slice(i, i + len))
    }
  }

  return [...seeds].sort((a, b) => b.length - a.length || a.localeCompare(b, 'zh-CN'))
}

export function pickAnchorFromDocumentText(fullText: string, query: string): string | null {
  const normalizedFull = normalizeAnchorText(fullText)
  const normalizedQuery = normalizeAnchorText(query)
  if (!normalizedQuery) return null

  const directIdx = normalizedFull.indexOf(normalizedQuery)
  if (directIdx >= 0) {
    return normalizedFull.slice(directIdx, directIdx + normalizedQuery.length)
  }

  const lowerFull = normalizedFull.toLowerCase()
  const lowerQuery = normalizedQuery.toLowerCase()
  const idx = lowerFull.indexOf(lowerQuery)
  if (idx < 0) return null

  return normalizedFull.slice(idx, idx + normalizedQuery.length)
}

export function buildAnchorSnippetsFromBlock(fullText: string, query: string): string[] {
  const normalizedFull = normalizeAnchorText(fullText)
  const normalizedQuery = normalizeAnchorText(query)
  if (!normalizedQuery) return []

  const lowerFull = normalizedFull.toLowerCase()
  const idx = lowerFull.indexOf(normalizedQuery.toLowerCase())
  if (idx < 0) return []

  const snippets = new Set<string>()
  for (const len of [normalizedQuery.length, 48, 32, 24, 16, 12, 8, 6, 4, 3, 2]) {
    if (len < 2 || len > normalizedFull.length) continue
    const end = Math.min(normalizedFull.length, idx + len)
    snippets.add(normalizedFull.slice(idx, end))
  }

  return [...snippets].filter((snippet) => snippet.length >= 2)
}

export function pickLineAnchorsFromBlockText(fullText: string, query: string): string[] {
  const normalizedQuery = normalizeAnchorText(query)
  if (!normalizedQuery) return []

  const lines = fullText
    .split(/\n+/)
    .map((line) => normalizeAnchorText(line))
    .filter((line) => line.length >= 2)

  const lowerQuery = normalizedQuery.toLowerCase()
  const matchingLines = lines.filter((line) => line.toLowerCase().includes(lowerQuery))
  const seeds = matchingLines.length > 0 ? matchingLines : lines

  const anchors = new Set<string>()
  for (const line of seeds) {
    anchors.add(line)
    for (const snippet of buildAnchorSnippetsFromBlock(line, normalizedQuery)) {
      anchors.add(snippet)
    }
  }

  return [...anchors]
}

export function collectAnchorsFromBlockText(fullText: string, query: string): string[] {
  const anchors = new Set<string>()
  const segments = new Set<string>([fullText])

  for (const line of fullText.split(/\n+/)) {
    segments.add(line)
    for (const cell of line.split(/\|/)) {
      segments.add(cell)
    }
  }

  for (const segment of segments) {
    const normalizedSegment = normalizeAnchorText(segment)
    if (normalizedSegment.length < 2) continue

    for (const lineAnchor of pickLineAnchorsFromBlockText(normalizedSegment, query)) {
      anchors.add(lineAnchor)
    }

    for (const snippet of buildAnchorSnippetsFromBlock(normalizedSegment, query)) {
      anchors.add(snippet)
    }

    const picked =
      pickAnchorFromDocumentText(normalizedSegment, query) ??
      pickAnchorFromDocumentText(normalizedSegment, normalizeAnchorText(query))
    if (picked) anchors.add(picked)

    if (normalizedSegment.length <= 48) {
      anchors.add(normalizedSegment)
    }
  }

  return [...anchors].filter((anchor) => anchor.length >= 2)
}

function orderCommentAnchorCandidates(
  candidates: Iterable<string>,
  preferredFirst: readonly string[] = [],
): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []

  for (const preferred of preferredFirst) {
    const normalized = normalizeAnchorText(preferred)
    if (normalized.length >= 2 && !seen.has(normalized)) {
      seen.add(normalized)
      ordered.push(normalized)
    }
  }

  const rest = [...new Set([...candidates].map((item) => normalizeAnchorText(item)).filter(Boolean))]
    .filter((candidate) => candidate.length >= 2 && !seen.has(candidate))
    .sort((a, b) => a.length - b.length || a.localeCompare(b, 'zh-CN'))

  for (const candidate of rest) {
    seen.add(candidate)
    ordered.push(candidate)
  }

  return ordered
}

function orderVerifiedCommentAnchors(
  candidates: Iterable<string>,
  preferredFirst: readonly string[] = [],
): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []

  for (const preferred of preferredFirst) {
    const normalized = normalizeAnchorText(preferred)
    if (normalized.length >= 2 && !seen.has(normalized)) {
      seen.add(normalized)
      ordered.push(normalized)
    }
  }

  const rest = [...new Set([...candidates].map((item) => normalizeAnchorText(item)).filter(Boolean))]
    .filter((candidate) => candidate.length >= 2 && !seen.has(candidate))
    .sort((a, b) => b.length - a.length || a.localeCompare(b, 'zh-CN'))

  for (const candidate of rest) {
    seen.add(candidate)
    ordered.push(candidate)
  }

  return ordered
}

/** 决定 add_comment 的锚点尝试顺序：已通过 search_text 验证的候选优先，未验证截断放最后 */
export function buildCommentAnchorAttemptOrder(options: {
  anchorText: string
  strictCandidates: readonly string[]
  verifiedAnchors: Iterable<string>
}): string[] {
  const verified = new Set<string>()
  for (const anchor of options.verifiedAnchors) {
    const normalized = normalizeAnchorText(anchor)
    if (normalized.length >= 2) verified.add(normalized)
  }

  const strict = dedupeAnchorTexts(options.strictCandidates)
  const normalizedOriginal = normalizeAnchorText(options.anchorText)

  if (verified.size === 0) {
    return dedupeAnchorTexts([normalizedOriginal, ...strict]).slice(0, MAX_COMMENT_ANCHOR_ATTEMPTS)
  }

  const strictVerified = strict.filter((anchor) => verified.has(anchor))
  const strictUnverified = strict.filter((anchor) => !verified.has(anchor))

  const preferred: string[] = [...strictVerified]
  if (normalizedOriginal.length >= 2 && verified.has(normalizedOriginal)) {
    if (!preferred.includes(normalizedOriginal)) preferred.push(normalizedOriginal)
  }

  const verifiedOrdered = orderVerifiedCommentAnchors(verified, preferred)
  const fallbacks = orderCommentAnchorCandidates(
    strictUnverified,
    normalizedOriginal.length >= 2 && !verified.has(normalizedOriginal) ? [normalizedOriginal] : [],
  ).slice(0, 6)

  return dedupeAnchorTexts([...verifiedOrdered, ...fallbacks]).slice(0, MAX_COMMENT_ANCHOR_ATTEMPTS)
}
