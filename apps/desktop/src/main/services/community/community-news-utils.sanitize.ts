const NEWS_ARTICLE_HTML_MAX_LENGTH = 40_000

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
    .replace(/\bhref\s*=\s*(["'])javascript:[^"']*\1/gi, 'href=$1#$1')
    .replace(/\bsrc\s*=\s*(["'])javascript:[^"']*\1/gi, 'src=$1#$1')

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
