export function formatCommunityDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** @deprecated Prefer formatCommunityDate */
export const formatNewsDate = formatCommunityDate

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

export function formatCommunityPreview(text: string, maxLength = 120): string {
  const normalized = stripHtmlText(text)
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength)}…`
}

/** @deprecated Prefer formatCommunityPreview */
export const formatNewsPreview = formatCommunityPreview

export function formatBoardMessageTitle(body: string, maxLength = 60): string {
  const firstLine = body.split('\n')[0]?.replace(/\s+/g, ' ').trim() ?? ''
  return formatCommunityPreview(firstLine || body, maxLength)
}
