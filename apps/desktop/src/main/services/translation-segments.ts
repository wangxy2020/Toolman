const MAX_SEGMENT_CHARS = 2000

/**
 * Split source text into model-call segments.
 *
 * - Short texts (word lists, brief notes) stay in one request.
 * - Only blank-line paragraphs are split boundaries (not single newlines).
 * - Long paragraphs are further split by sentence / hard wrap.
 */
function extractLeadingTableUnit(text: string): { unit: string; rest: string } | null {
  // Only when the table is at the start — prose-before-table is handled by the caller.
  const leading = text.match(/^\s*/)![0]!.length
  const fromStart = text.slice(leading)
  const html = fromStart.match(/^<table\b[\s\S]*?<\/table>/i)
  if (html) {
    return {
      unit: html[0],
      rest: text.slice(leading + html[0].length).trim(),
    }
  }
  // Keep contiguous GFM pipe-table blocks intact.
  if (/^\s*\|.+\|\s*$/m.test(text)) {
    const lines = text.split('\n')
    const tableLines: string[] = []
    let i = 0
    while (i < lines.length && !lines[i]!.trim()) i += 1
    while (i < lines.length && !/^\s*\|.+\|\s*$/.test(lines[i]!)) i += 1
    if (i > 0 && lines.slice(0, i).some((line) => line.trim())) return null
    while (i < lines.length && (/^\s*\|.+\|\s*$/.test(lines[i]!) || /^\s*\|?\s*:?-+:?\s*\|/.test(lines[i]!))) {
      tableLines.push(lines[i]!)
      i += 1
    }
    if (tableLines.length >= 2) {
      return { unit: tableLines.join('\n'), rest: lines.slice(i).join('\n').trim() }
    }
  }
  return null
}

export function splitTranslationSegments(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  // One request for short inputs — avoids N serial LLM calls for word lists.
  if (normalized.length <= MAX_SEGMENT_CHARS) {
    return [normalized]
  }

  // Never bisect real tables — translate each table as one segment unit.
  if (/<table\b/i.test(normalized) || /^\s*\|.+\|\s*$/m.test(normalized)) {
    const segments: string[] = []
    let rest = normalized
    while (rest) {
      const tableUnit = extractLeadingTableUnit(rest)
      if (tableUnit) {
        segments.push(tableUnit.unit)
        rest = tableUnit.rest
        continue
      }
      const nextTableAt = rest.search(/<table\b/i)
      const prose = nextTableAt >= 0 ? rest.slice(0, nextTableAt).trim() : rest
      if (prose) segments.push(...splitTranslationSegments(prose))
      rest = nextTableAt >= 0 ? rest.slice(nextTableAt).trim() : ''
      if (nextTableAt < 0) break
    }
    return segments.filter(Boolean)
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
