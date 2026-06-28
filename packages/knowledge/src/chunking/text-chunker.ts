import {
  maxEmbedCharsForText,
  resolveEmbedTokenBudget,
  splitTextForEmbedding,
} from './embed-limits.js'

export interface ChunkConfig {
  chunkSize: number
  chunkOverlap: number
  strategy: 'fixed' | 'markdown' | 'semantic'
}

export interface TextChunk {
  index: number
  text: string
  tokenCount: number
  metadata?: Record<string, unknown>
}

export function approxTokenCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0

  const cjk = (
    trimmed.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\u30a0-\u30ff]/g) ?? []
  ).length
  const other = trimmed.length - cjk
  return Math.max(1, Math.ceil(cjk + other / 4))
}

export function chunkText(text: string, config: ChunkConfig): TextChunk[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  if (config.strategy === 'markdown') {
    return chunkMarkdown(normalized, config)
  }

  if (config.strategy === 'semantic') {
    return chunkFixed(normalized, config)
  }

  return chunkFixed(normalized, config)
}

export async function chunkTextAsync(
  text: string,
  config: ChunkConfig,
  embedBatch: (texts: string[]) => Promise<number[][]>,
): Promise<TextChunk[]> {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  if (config.strategy === 'markdown') {
    return chunkMarkdown(normalized, config)
  }

  if (config.strategy !== 'semantic') {
    return chunkFixed(normalized, config)
  }

  return chunkSemantic(normalized, config, embedBatch)
}

async function chunkSemantic(
  text: string,
  config: ChunkConfig,
  embedBatch: (texts: string[]) => Promise<number[][]>,
): Promise<TextChunk[]> {
  const units = splitSemanticUnits(text, config)
  if (units.length === 0) return []
  if (units.length === 1) {
    return chunkFixed(units[0]!, config)
  }

  const vectors = await embedBatch(units)
  const chunks: TextChunk[] = []
  let currentUnits: string[] = [units[0]!]
  let currentTokens = approxTokenCount(units[0]!)
  let index = 0
  const similarityThreshold = 0.72

  const flush = () => {
    const chunkTextValue = currentUnits.join('\n\n').trim()
    if (!chunkTextValue) return
    chunks.push({
      index: index++,
      text: chunkTextValue,
      tokenCount: approxTokenCount(chunkTextValue),
      metadata: { strategy: 'semantic' },
    })
  }

  for (let i = 1; i < units.length; i += 1) {
    const unit = units[i]!
    const unitTokens = approxTokenCount(unit)
    const similarity = cosineSimilarity(vectors[i - 1]!, vectors[i]!)
    const wouldExceed = currentTokens + unitTokens > config.chunkSize

    if (wouldExceed || similarity < similarityThreshold) {
      flush()
      const overlapUnit =
        config.chunkOverlap > 0 && currentUnits.length > 0
          ? currentUnits[currentUnits.length - 1]!
          : null
      currentUnits = overlapUnit ? [overlapUnit, unit] : [unit]
      currentTokens = currentUnits.reduce((sum, item) => sum + approxTokenCount(item), 0)
      continue
    }

    currentUnits.push(unit)
    currentTokens += unitTokens
  }

  flush()
  return chunks
}

function splitSemanticUnits(text: string, config: ChunkConfig): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)

  const units =
    paragraphs.length > 1
      ? paragraphs
      : text
          .split(/(?<=[.!?。！？])\s+/)
          .map((item) => item.trim())
          .filter((item) => item.length > 0)

  if (units.length === 0) return []

  const unitBudget = Math.min(config.chunkSize, resolveEmbedTokenBudget(config.chunkSize))
  return units.flatMap((unit) => splitTextForEmbedding(unit, unitBudget, config.chunkOverlap))
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0

  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!
    normA += a[i]! * a[i]!
    normB += b[i]! * b[i]!
  }

  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function chunkMarkdown(text: string, config: ChunkConfig): TextChunk[] {
  const sections = splitMarkdownSections(text)
  const chunks: TextChunk[] = []
  let index = 0

  for (const section of sections) {
    const headingPrefix = section.heading ? `${section.heading}\n\n` : ''
    const headingTokens = approxTokenCount(headingPrefix)
    const bodyConfig: ChunkConfig =
      headingTokens > 0
        ? {
            ...config,
            chunkSize: Math.max(64, config.chunkSize - headingTokens),
          }
        : config
    const sectionChunks = chunkFixed(section.body, bodyConfig, {
      heading: section.heading,
    })
    for (const chunk of sectionChunks) {
      const prefix = headingPrefix
      chunks.push({
        ...chunk,
        index: index++,
        text: `${prefix}${chunk.text}`.trim(),
        tokenCount: approxTokenCount(`${prefix}${chunk.text}`),
      })
    }
  }

  return chunks
}

function splitMarkdownSections(text: string): Array<{ heading: string; body: string }> {
  const lines = text.split('\n')
  const sections: Array<{ heading: string; body: string }> = []
  let currentHeading = ''
  let currentBody: string[] = []

  const flush = () => {
    const body = currentBody.join('\n').trim()
    if (body || currentHeading) {
      sections.push({ heading: currentHeading, body })
    }
    currentBody = []
  }

  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) {
      flush()
      currentHeading = line.trim()
      continue
    }
    currentBody.push(line)
  }

  flush()

  if (sections.length === 0) {
    return [{ heading: '', body: text }]
  }

  return sections.filter((section) => section.body.length > 0 || section.heading.length > 0)
}

function chunkFixed(
  text: string,
  config: ChunkConfig,
  metadata?: Record<string, unknown>,
): TextChunk[] {
  const charSize = maxEmbedCharsForText(text, config.chunkSize)
  const charOverlap = Math.min(
    maxEmbedCharsForText(text, config.chunkOverlap),
    Math.floor(charSize / 4),
  )
  if (text.length <= charSize) {
    return [
      {
        index: 0,
        text,
        tokenCount: approxTokenCount(text),
        metadata,
      },
    ]
  }

  const chunks: TextChunk[] = []
  let start = 0
  let index = 0

  while (start < text.length) {
    let end = Math.min(start + charSize, text.length)
    if (end < text.length) {
      const window = text.slice(start, end)
      const breakAt = Math.max(
        window.lastIndexOf('\n\n'),
        window.lastIndexOf('\n'),
        window.lastIndexOf('。'),
        window.lastIndexOf('！'),
        window.lastIndexOf('？'),
        window.lastIndexOf('. '),
      )
      if (breakAt > charSize * 0.5) {
        end = start + breakAt + 1
      }
    }

    const slice = text.slice(start, end).trim()
    if (slice) {
      chunks.push({
        index: index++,
        text: slice,
        tokenCount: approxTokenCount(slice),
        metadata,
      })
    }
    if (end >= text.length) break
    start = Math.max(end - charOverlap, start + 1)
  }

  return chunks
}
