export function extractLlmJsonArray(raw: string): unknown[] | null {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1]?.trim() ?? trimmed

  if (candidate.startsWith('[')) {
    try {
      const parsed = JSON.parse(candidate)
      return Array.isArray(parsed) ? parsed : null
    } catch {
      // fall through to bracket slice
    }
  }

  const start = candidate.indexOf('[')
  const end = candidate.lastIndexOf(']')
  if (start === -1 || end <= start) return null

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1))
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}
