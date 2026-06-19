import type { MouseEvent } from 'react'

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

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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

export function hasMeaningfulNewsHtml(html: string): boolean {
  return cleanNewsSummary(html).length >= 20
}

const PAGE_SHELL_MARKERS = [
  '@container',
  'radix-',
  'chatgpt-conversation',
  'data-dgst=',
  'toc-visible',
  'max-w-container',
  'data-testid="testimonial-carousel',
  'article-mian-content',
  'article-wrapper',
  'common-width',
]

export function isScrapedPageShellHtml(html: string): boolean {
  if (html.length < 1500) return false
  if (PAGE_SHELL_MARKERS.some((marker) => html.includes(marker))) return true
  return (html.match(/<div\b/gi) ?? []).length >= 15
}

export function shouldSimplifyArticleHtml(html: string): boolean {
  return isScrapedPageShellHtml(html) || (html.match(/<div\b/gi) ?? []).length >= 10
}

function resolveArticleHref(href: string, baseUrl?: string | null): string | null {
  const trimmed = href.trim()
  if (!trimmed || trimmed.startsWith('#') || trimmed.toLowerCase().startsWith('javascript:')) {
    return null
  }
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (!baseUrl) return null
  try {
    return new URL(trimmed, baseUrl).toString()
  } catch {
    return null
  }
}

function simplifyParagraphInner(inner: string, baseUrl?: string | null): string {
  let result = ''
  let remaining = inner

  while (remaining.length > 0) {
    const linkMatch = remaining.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i)
    if (!linkMatch || linkMatch.index === undefined) {
      result += escapeHtmlText(stripHtmlText(remaining))
      break
    }

    const before = remaining.slice(0, linkMatch.index)
    result += escapeHtmlText(stripHtmlText(before))

    const href = linkMatch[1]?.match(/\bhref=["']([^"']+)["']/i)?.[1]
    const linkText = stripHtmlText(linkMatch[2] ?? '')
    const resolved = href ? resolveArticleHref(href, baseUrl) : null
    if (resolved && linkText) {
      result += `<a href="${escapeHtmlText(resolved)}" target="_blank" rel="noreferrer noopener">${escapeHtmlText(linkText)}</a>`
    } else if (linkText) {
      result += escapeHtmlText(linkText)
    }

    remaining = remaining.slice(linkMatch.index + linkMatch[0].length)
  }

  return result
}

export function simplifyScrapedArticleHtml(html: string, baseUrl?: string | null): string {
  const parts: string[] = []
  const seen = new Set<string>()

  const addUnique = (key: string, block: string) => {
    if (key.length < 2 || seen.has(key)) return
    seen.add(key)
    parts.push(block)
  }

  for (const match of html.matchAll(/<h([123])[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const text = stripHtmlText(match[2] ?? '')
    if (text.length >= 4) {
      addUnique(`h:${text}`, `<h${match[1]}>${escapeHtmlText(text)}</h${match[1]}>`)
    }
  }

  for (const match of html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const inner = match[1] ?? ''
    const simplifiedInner = simplifyParagraphInner(inner, baseUrl)
    const plain = stripHtmlText(simplifiedInner)
    if (plain.length >= 8) {
      addUnique(`p:${plain}`, `<p>${simplifiedInner}</p>`)
    }
  }

  for (const match of html.matchAll(/<ul[^>]*>([\s\S]*?)<\/ul>/gi)) {
    const items: string[] = []
    for (const li of (match[1] ?? '').matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
      const text = stripHtmlText(li[1] ?? '')
      if (text.length >= 4) items.push(`<li>${escapeHtmlText(text)}</li>`)
    }
    if (items.length > 0) {
      const key = items.map((item) => stripHtmlText(item)).join('|')
      addUnique(`ul:${key}`, `<ul>${items.join('')}</ul>`)
    }
  }

  let imageCount = 0
  for (const match of html.matchAll(/<img\b([^>]*)>/gi)) {
    if (imageCount >= 3) break
    const attrs = match[1] ?? ''
    const src = attrs.match(/\bsrc=["']([^"']+)["']/i)?.[1]?.trim()
    if (!src || !/^https?:\/\//i.test(src)) continue
    const alt = attrs.match(/\balt=["']([^"']*)["']/i)?.[1] ?? ''
    addUnique(`img:${src}`, `<p><img src="${escapeHtmlText(src)}" alt="${escapeHtmlText(alt)}" loading="lazy" /></p>`)
    imageCount += 1
  }

  return parts.join('\n')
}

export function summaryToArticleHtml(summary: string): string {
  const raw = summary.trim()
  if (!raw) return ''

  const paragraphs = raw
    .split(/\n{2,}/)
    .map((part) => cleanNewsSummary(part))
    .filter((part) => part.length > 0)

  if (paragraphs.length <= 1) {
    const text = paragraphs[0] ?? cleanNewsSummary(raw)
    if (!text) return ''
    return `<p>${escapeHtmlText(text)}</p>`
  }

  return paragraphs.map((part) => `<p>${escapeHtmlText(part)}</p>`).join('\n')
}

function normalizeArticleHtml(html: string, baseUrl?: string | null): string {
  const trimmed = html.trim()
  if (!trimmed || !hasMeaningfulNewsHtml(trimmed)) return ''

  if (shouldSimplifyArticleHtml(trimmed)) {
    const simplified = simplifyScrapedArticleHtml(trimmed, baseUrl).trim()
    if (simplified) return sanitizeNewsArticleHtml(simplified, baseUrl)

    const plain = cleanNewsSummary(trimmed)
    if (plain) return summaryToArticleHtml(plain)
    return ''
  }

  return sanitizeNewsArticleHtml(trimmed, baseUrl)
}

export function resolveNewsArticleBodyHtml(article: {
  title: string
  summary?: string | null
  contentHtml?: string | null
  link?: string | null
}): string {
  const contentHtml = article.contentHtml?.trim()
  if (contentHtml) {
    const body = normalizeArticleHtml(contentHtml, article.link)
    if (body) return body
  }

  const summary = article.summary?.trim()
  if (!summary) return ''

  if (/<[a-z][\s\S]*>/i.test(summary) && hasMeaningfulNewsHtml(summary)) {
    const body = normalizeArticleHtml(summary, article.link)
    if (body) return body
  }

  return summaryToArticleHtml(summary)
}

const NEWS_ARTICLE_HTML_MAX_LENGTH = 40_000

export function sanitizeNewsArticleHtml(html: string, baseUrl?: string | null): string {
  let sanitized = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>/gi, '')
    .replace(/<link[\s\S]*?>/gi, '')
    .replace(/<meta[\s\S]*?>/gi, '')
    .replace(/<base[\s\S]*?>/gi, '')
    .replace(/<\/?(html|head|body)[^>]*>/gi, '')
    .replace(/<(button|nav|audio|template|form|svg)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<(button|input|select|textarea)\b[^>]*\/?>/gi, '')
    .replace(/\bon\w+\s*=\s*(["'])[^"']*\1/gi, '')

  const bodyMatch = sanitized.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  if (bodyMatch?.[1]) {
    sanitized = bodyMatch[1]
  }

  if (baseUrl) {
    sanitized = sanitized.replace(/\bhref=(["'])(\/[^"'#][^"']*)\1/gi, (_match, quote: string, path: string) => {
      const resolved = resolveArticleHref(path, baseUrl)
      return resolved ? `href=${quote}${resolved}${quote}` : `href=${quote}#${quote}`
    })
  }

  sanitized = sanitized.trim()
  if (sanitized.length > NEWS_ARTICLE_HTML_MAX_LENGTH) {
    sanitized = `${sanitized.slice(0, NEWS_ARTICLE_HTML_MAX_LENGTH)}…`
  }

  return sanitized
}

export function handleNewsArticleContentClick(event: MouseEvent<HTMLElement>) {
  const anchor = (event.target as HTMLElement).closest('a')
  if (!anchor) return
  const href = anchor.getAttribute('href')?.trim()
  if (!href || href.startsWith('#') || href.toLowerCase().startsWith('javascript:')) return
  event.preventDefault()
  event.stopPropagation()
  window.open(href, '_blank', 'noopener,noreferrer')
}

export function formatBoardMessageTitle(body: string, maxLength = 60): string {
  const firstLine = body.split('\n')[0]?.replace(/\s+/g, ' ').trim() ?? ''
  return formatNewsPreview(firstLine || body, maxLength)
}

export function formatRssSourceError(message: string): string {
  if (message.includes('feed_url already exists')) {
    return '该 Feed 地址已存在，请在下方列表中查找或使用其他地址'
  }
  if (message.includes('Invalid uuid') || message.includes('"validation": "uuid"')) {
    return 'RSS 源数据格式异常，请刷新列表后重试'
  }
  return message
}

export function getNewsArticleSizeBytes(article: {
  title: string
  summary?: string | null
  contentHtml?: string | null
}): number {
  return (
    article.title.length +
    (article.summary?.length ?? 0) +
    (article.contentHtml?.length ?? 0)
  )
}

export function formatNewsListError(message: string): string {
  if (message.includes('Invalid uuid') && message.includes('sourceId')) {
    return '资讯数据格式异常，请刷新页面重试'
  }
  if (message.includes('"validation": "uuid"')) {
    return '资讯数据格式异常，请刷新页面重试'
  }
  return message
}
