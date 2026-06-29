/** Best-effort JWT payload decode (no signature verification). */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const trimmed = token.trim()
  const parts = trimmed.split('.')
  if (parts.length < 2) return null

  try {
    const segment = parts[1]!.replace(/-/g, '+').replace(/_/g, '/')
    const padded = segment + '='.repeat((4 - (segment.length % 4)) % 4)
    const json = Buffer.from(padded, 'base64').toString('utf8')
    const parsed = JSON.parse(json) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function readStringClaim(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return null
}

/** Resolve Authing user id from access token, falling back to binding subject id. */
export function resolveAuthingUserIdFromAccessToken(
  accessToken: string | null | undefined,
  fallbackSubjectId: string,
): string {
  const fallback = fallbackSubjectId.trim()
  const trimmedToken = accessToken?.trim()
  if (!trimmedToken) return fallback

  const payload = decodeJwtPayload(trimmedToken)
  if (!payload) return fallback

  const fromToken = readStringClaim(payload, ['sub', 'id', 'userId', 'user_id'])
  if (fromToken) return fromToken

  return fallback
}

export function looksLikeEmailSubject(subjectId: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subjectId.trim())
}
