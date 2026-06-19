export function normalizeUrlInput(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function deriveKnowledgeBaseNameFromUrl(url: string): string | null {
  const normalized = normalizeUrlInput(url)
  if (!normalized) return null

  try {
    const parsed = new URL(normalized)
    const host = parsed.hostname.replace(/^www\./i, '')
    const path = parsed.pathname.replace(/\/$/, '')
    if (path && path !== '/') {
      const segment = path.split('/').filter(Boolean).pop()
      if (segment) return decodeURIComponent(segment)
    }
    return host || null
  } catch {
    return null
  }
}
