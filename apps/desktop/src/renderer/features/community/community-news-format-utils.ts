export function formatNewsDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function stripHtmlText(text: string): string {
  return text
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function isNewsMetadataLine(line: string): boolean {
  return /^(article url|comments url|points|#\s*comments|via)\s*:/i.test(line.trim())
}

export function cleanNewsSummary(summary: string): string {
  const stripped = stripHtmlText(summary)
  if (!stripped) return ''

  const contentLines = stripped
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !isNewsMetadataLine(line))

  return (contentLines.length > 0 ? contentLines.join(' ') : stripped)
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractNewsArticleText(article: {
  title: string
  summary?: string | null
  contentHtml?: string | null
}): string {
  const htmlText = article.contentHtml ? cleanNewsSummary(article.contentHtml) : ''
  const summaryText = article.summary ? cleanNewsSummary(article.summary) : ''
  const candidates = [htmlText, summaryText].filter((text) => text.length > 0)
  const best = candidates.sort((left, right) => right.length - left.length)[0] ?? ''

  if (best.length >= 20) return best
  if (summaryText && !isMostlyMetadata(summaryText)) return summaryText
  if (htmlText.length > 0) return htmlText
  return ''
}

function isMostlyMetadata(text: string): boolean {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return true
  const metadataCount = lines.filter((line) => isNewsMetadataLine(line)).length
  return metadataCount === lines.length
}

export function formatNewsPreview(text: string, maxLength = 120): string {
  const normalized = cleanNewsSummary(text)
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength)}…`
}

export function formatNewsArticleDescription(
  article: {
    title: string
    summary?: string | null
    contentHtml?: string | null
  },
  maxLength = 120,
): string {
  const text = extractNewsArticleText(article)
  return formatNewsPreview(text || article.title, maxLength)
}

export function isPlaceholderNewsAuthor(author?: string | null): boolean {
  if (!author) return true
  const normalized = author.trim().toLowerCase()
  return normalized.length === 0 || normalized === 'author' || normalized === 'unknown'
}

