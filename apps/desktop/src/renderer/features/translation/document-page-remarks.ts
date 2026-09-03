export function normalizePageRemarks(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const page = Number.parseInt(key, 10)
    if (!Number.isFinite(page) || page < 1) continue
    if (typeof value !== 'string' || !value.trim()) continue
    next[String(page)] = value
  }
  return Object.keys(next).length > 0 ? next : undefined
}

export function getPageRemark(
  remarks: Record<string, string> | undefined,
  pageNumber: number,
): string {
  if (!remarks) return ''
  const value = remarks[String(Math.max(1, Math.floor(pageNumber) || 1))]
  return typeof value === 'string' ? value : ''
}

export function setPageRemark(
  remarks: Record<string, string> | undefined,
  pageNumber: number,
  text: string,
): Record<string, string> | undefined {
  const page = String(Math.max(1, Math.floor(pageNumber) || 1))
  const next: Record<string, string> = { ...(remarks ?? {}) }
  if (text.trim()) next[page] = text
  else delete next[page]
  return Object.keys(next).length > 0 ? next : undefined
}

export function resolveSavedPageRemarks(
  remarks: Record<string, string> | undefined,
  pending: { pageNumber: number; text: string } | null | undefined,
): Record<string, string> | undefined {
  if (!pending) return remarks && Object.keys(remarks).length > 0 ? remarks : undefined
  return setPageRemark(remarks, pending.pageNumber, pending.text)
}
