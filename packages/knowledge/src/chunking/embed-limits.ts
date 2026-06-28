import { approxTokenCount } from './text-chunker.js'

const MIN_EMBED_CHARS = 64
/** User-configured chunk token budget cap (not model context). */
export const EMBED_CHUNK_TOKEN_HARD_CAP = 512
const MIN_TOKENS_PER_CHAR = 0.25

const MODEL_INPUT_CHAR_LIMITS: Array<{ pattern: RegExp; maxChars: number }> = [
  { pattern: /bge-m3/i, maxChars: 1200 },
  { pattern: /nomic-embed/i, maxChars: 1500 },
  { pattern: /embed/i, maxChars: 1000 },
]

export function isEmbedContextLengthError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('context length') ||
    lower.includes('input length exceeds') ||
    lower.includes('maximum context') ||
    lower.includes('token limit') ||
    lower.includes('too long')
  )
}

export function resolveEmbedInputCharLimit(modelId?: string | null): number {
  const normalized = modelId?.toLowerCase() ?? ''
  for (const entry of MODEL_INPUT_CHAR_LIMITS) {
    if (entry.pattern.test(normalized)) {
      return entry.maxChars
    }
  }
  return 800
}

export function resolveEmbedTokenBudget(maxTokens: number): number {
  return Math.max(MIN_EMBED_CHARS, Math.min(maxTokens, EMBED_CHUNK_TOKEN_HARD_CAP))
}

export function estimateTokensPerChar(text: string): number {
  const sample = text.slice(0, 4096)
  if (!sample) return MIN_TOKENS_PER_CHAR
  return approxTokenCount(sample) / sample.length
}

export function maxEmbedCharsForText(
  text: string,
  maxTokens: number,
  modelId?: string | null,
): number {
  const boundedTokens = resolveEmbedTokenBudget(maxTokens)
  const modelCharLimit = resolveEmbedInputCharLimit(modelId)
  const tokensPerChar = Math.max(estimateTokensPerChar(text), MIN_TOKENS_PER_CHAR)
  const fromEstimate = Math.floor(boundedTokens / tokensPerChar)
  return Math.max(MIN_EMBED_CHARS, Math.min(fromEstimate, modelCharLimit, boundedTokens))
}

export function splitTextByMaxChars(text: string, maxChars: number, overlapChars = 0): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []
  if (normalized.length <= maxChars) return [normalized]

  const parts: string[] = []
  let start = 0

  while (start < normalized.length) {
    let end = Math.min(start + maxChars, normalized.length)
    if (end < normalized.length) {
      const window = normalized.slice(start, end)
      const breakAt = Math.max(
        window.lastIndexOf('\n\n'),
        window.lastIndexOf('\n'),
        window.lastIndexOf('。'),
        window.lastIndexOf('！'),
        window.lastIndexOf('？'),
        window.lastIndexOf('. '),
      )
      if (breakAt > maxChars * 0.5) {
        end = start + breakAt + 1
      }
    }

    const slice = normalized.slice(start, end).trim()
    if (slice) parts.push(slice)
    if (end >= normalized.length) break
    start = Math.max(end - overlapChars, start + 1)
  }

  return parts
}

export function splitTextForEmbedding(
  text: string,
  maxTokens: number,
  overlapTokens = 0,
  modelId?: string | null,
): string[] {
  const maxChars = maxEmbedCharsForText(text, maxTokens, modelId)
  const overlapChars =
    overlapTokens > 0 ? maxEmbedCharsForText(text, overlapTokens, modelId) : 0
  return splitTextByMaxChars(text, maxChars, overlapChars)
}

export function assertEmbedSafeTexts(texts: string[], modelId?: string | null): void {
  const limit = resolveEmbedInputCharLimit(modelId)
  for (const [index, text] of texts.entries()) {
    if (text.length > limit) {
      throw new Error(
        `Embedding 内部分段异常：第 ${index + 1} 段长度 ${text.length} 超过 ${limit} 字符限制`,
      )
    }
  }
}
