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

function collectRoleStrings(value: unknown, roles: string[]): void {
  if (typeof value === 'string' && value.trim()) {
    roles.push(value.trim())
    return
  }
  if (!Array.isArray(value)) return
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) {
      roles.push(item.trim())
      continue
    }
    if (item && typeof item === 'object') {
      const record = item as { code?: string | null; name?: string | null }
      if (record.code?.trim()) roles.push(record.code.trim())
      if (record.name?.trim()) roles.push(record.name.trim())
    }
  }
}

/** Best-effort role codes from Authing access/id token claims (no network). */
export function extractAuthingRolesFromAccessToken(
  accessToken: string | null | undefined,
): string[] {
  const trimmedToken = accessToken?.trim()
  if (!trimmedToken) return []

  const payload = decodeJwtPayload(trimmedToken)
  if (!payload) return []

  const roles: string[] = []
  for (const key of ['roles', 'role', 'authorities', 'permissions']) {
    collectRoleStrings(payload[key], roles)
  }

  const extension = payload.ext
  if (extension && typeof extension === 'object') {
    const extRecord = extension as Record<string, unknown>
    for (const key of ['roles', 'role']) {
      collectRoleStrings(extRecord[key], roles)
    }
  }

  return [...new Set(roles)]
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
