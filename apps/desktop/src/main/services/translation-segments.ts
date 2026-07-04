const MAX_SEGMENT_CHARS = 1200

/**
 * Split source text into model-call segments.
 *
 * - Short texts (word lists, brief notes) stay in one request.
 * - Only blank-line paragraphs are split boundaries (not single newlines).
 * - Long paragraphs are further split by sentence / hard wrap.
 */
export function splitTranslationSegments(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  // One request for short inputs — avoids N serial LLM calls for word lists.
  if (normalized.length <= MAX_SEGMENT_CHARS) {
    return [normalized]
  }

  const paragraphs = normalized
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (paragraphs.length <= 1) {
    return splitLongParagraph(normalized, MAX_SEGMENT_CHARS)
  }

  const segments: string[] = []
  let current = ''

  for (const paragraph of paragraphs) {
    if (paragraph.length > MAX_SEGMENT_CHARS) {
      if (current) {
        segments.push(current)
        current = ''
      }
      segments.push(...splitLongParagraph(paragraph, MAX_SEGMENT_CHARS))
      continue
    }

    const next = current ? `${current}\n\n${paragraph}` : paragraph
    if (current && next.length > MAX_SEGMENT_CHARS) {
      segments.push(current)
      current = paragraph
    } else {
      current = next
    }
  }

  if (current) segments.push(current)
  return segments
}

function splitLongParagraph(paragraph: string, maxChars: number): string[] {
  if (paragraph.length <= maxChars) return [paragraph]

  const pieces: string[] = []
  const sentences = paragraph.split(/(?<=[.!?。！？…])\s+/)
  let current = ''

  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence
    if (current && next.length > maxChars) {
      pieces.push(current)
      current = sentence
    } else {
      current = next
    }
  }

  if (current) pieces.push(current)

  return pieces.flatMap((piece) => {
    if (piece.length <= maxChars) return [piece]
    const chunks: string[] = []
    for (let i = 0; i < piece.length; i += maxChars) {
      chunks.push(piece.slice(i, i + maxChars))
    }
    return chunks
  })
}
