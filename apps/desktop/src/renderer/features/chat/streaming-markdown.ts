import { sanitizeAssistantMarkdown } from './sanitize-assistant-markdown'
import { normalizeStreamingHtmlLineBreaks } from './markdown-html-breaks'

function isMarkdownTableLine(line: string): boolean {
  return (
    /^\s*\|.*\|\s*$/.test(line) ||
    /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
  )
}

function findTrailingTableBlockStart(lines: string[], lastNonEmpty: number): number {
  let i = lastNonEmpty
  let blockStart = -1

  while (i >= 0) {
    const line = lines[i] ?? ''
    if (isMarkdownTableLine(line)) {
      blockStart = i
      i -= 1
      continue
    }
    if (!line.trim()) {
      i -= 1
      continue
    }
    break
  }

  return blockStart
}

/** Hide trailing partial GFM tables so stream output does not flash raw pipe syntax. */
export function hideIncompleteTrailingTable(text: string): string {
  const lines = text.split('\n')
  let lastNonEmpty = lines.length - 1
  while (lastNonEmpty >= 0 && !lines[lastNonEmpty]?.trim()) {
    lastNonEmpty -= 1
  }
  if (lastNonEmpty < 0) return text

  const blockStart = findTrailingTableBlockStart(lines, lastNonEmpty)
  if (blockStart < 0) return text

  const tableLines = lines.slice(blockStart, lastNonEmpty + 1).filter((line) => line.trim())
  const hasSeparator = tableLines.some((line) => /^\s*\|?\s*:?-{3,}/.test(line))
  if (hasSeparator) return text

  return lines
    .slice(0, blockStart)
    .join('\n')
    .replace(/\n{3,}$/, '\n\n')
}

/** Close unclosed markdown constructs so partial stream text renders like the final output. */
export function stabilizeIncompleteMarkdown(text: string): string {
  let result = text

  const codeFences = result.match(/```/g)
  if (codeFences && codeFences.length % 2 === 1) {
    result += '\n```'
  }

  const mathBlocks = result.match(/\$\$/g)
  if (mathBlocks && mathBlocks.length % 2 === 1) {
    result += '\n$$'
  }

  return result
}

export function prepareStreamingMarkdown(text: string, sanitize = false): string {
  const base = sanitize ? sanitizeAssistantMarkdown(text, { trim: false }) : text
  return stabilizeIncompleteMarkdown(
    hideIncompleteTrailingTable(normalizeStreamingHtmlLineBreaks(base)),
  )
}
