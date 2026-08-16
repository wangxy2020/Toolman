/** Browser-safe Toolman invite URL helpers. Token verify/gzip stay on desktop. */

export const TOOLMAN_INVITE_SCHEME = 'toolman:'
export const TOOLMAN_INVITE_HOST = 'join'
export const WAN_COMPRESSED_PAYLOAD_PREFIX = 'z1.'
export const WAN_RAW_PAYLOAD_PREFIX = 'r1.'

export type ParsedToolmanInviteUrl = {
  raw: string
  /** Invite token, or empty when only a `z` bundle is present. */
  token: string
  /** Compressed WAN invite bundle (`z` query). Desktop unpacks SDP + token. */
  bundled?: string
  /** Encoded SDP query (`sdp`), still encoded. */
  offerSdpEncoded?: string
  workspaceId?: string
  workspaceName?: string
  /** Owner Sync Hub origins (`hub=`), usually LAN / Tailscale. */
  hubUrls?: string[]
}

export type PeekedInviteTokenFields = {
  workspaceId?: string
  workspaceName?: string
  ownerIdentityId?: string
  ownerDeviceId?: string
  ownerDisplayName?: string
  role?: string
  expiresAt?: number
  workspaceKeyB64?: string
  /** `z1.` gzip blob — needs desktop/native inflate. */
  compressed?: boolean
}

function trimInput(input: string): string {
  return input.trim()
}

function firstQueryValue(params: URLSearchParams, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = params.get(key)?.trim()
    if (value) return value
  }
  return undefined
}

function decodeBase64UrlToUtf8(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(padded, 'base64').toString('utf8')
  }
  const binary = globalThis.atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function looksLikeUrl(input: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(input)
}

export function isToolmanInviteInput(input: string): boolean {
  const trimmed = trimInput(input)
  if (!trimmed) return false
  if (trimmed.startsWith(WAN_COMPRESSED_PAYLOAD_PREFIX) || trimmed.startsWith(WAN_RAW_PAYLOAD_PREFIX)) {
    return true
  }
  if (!looksLikeUrl(trimmed)) return false
  try {
    const url = new URL(trimmed)
    if (url.protocol === TOOLMAN_INVITE_SCHEME) return true
    return Boolean(
      url.searchParams.get('token') ||
        url.searchParams.get('inv') ||
        url.searchParams.get('z'),
    )
  } catch {
    return false
  }
}

export function parseToolmanInviteUrl(input: string): ParsedToolmanInviteUrl {
  const raw = trimInput(input)
  if (!raw) {
    throw new Error('邀请码不能为空')
  }

  if (!looksLikeUrl(raw)) {
    return { raw, token: raw }
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { raw, token: raw }
  }

  const bundled = firstQueryValue(url.searchParams, ['z'])
  const token = firstQueryValue(url.searchParams, ['token', 'inv']) ?? ''
  if (!bundled && !token) {
    throw new Error('邀请链接缺少 token 参数')
  }

  const hubUrls = url.searchParams
    .getAll('hub')
    .map((item) => item.trim())
    .filter(Boolean)

  return {
    raw,
    token,
    bundled,
    offerSdpEncoded: firstQueryValue(url.searchParams, ['sdp']),
    workspaceId: firstQueryValue(url.searchParams, ['wid', 'workspaceId']),
    workspaceName: firstQueryValue(url.searchParams, ['name', 'n']),
    hubUrls: hubUrls.length > 0 ? hubUrls : undefined,
  }
}

export function tryParseToolmanInviteUrl(input: string): ParsedToolmanInviteUrl | null {
  try {
    if (!isToolmanInviteInput(input)) return null
    return parseToolmanInviteUrl(input)
  } catch {
    return null
  }
}

export function peekInviteTokenFields(token: string): PeekedInviteTokenFields | null {
  const trimmed = trimInput(token)
  if (!trimmed) return null
  if (trimmed.startsWith(WAN_COMPRESSED_PAYLOAD_PREFIX)) {
    return { compressed: true }
  }

  const encoded = trimmed.startsWith(WAN_RAW_PAYLOAD_PREFIX)
    ? trimmed.slice(WAN_RAW_PAYLOAD_PREFIX.length)
    : trimmed

  try {
    const json = JSON.parse(decodeBase64UrlToUtf8(encoded)) as Record<string, unknown>
    const expiresAt = typeof json.expiresAt === 'number' ? json.expiresAt : undefined
    const workspaceKeyB64 = readOptionalString(json.workspaceKeyB64)
    return {
      workspaceId: readOptionalString(json.workspaceId),
      workspaceName: readOptionalString(json.workspaceName),
      ownerIdentityId: readOptionalString(json.ownerIdentityId),
      ownerDeviceId: readOptionalString(json.ownerDeviceId),
      ownerDisplayName: readOptionalString(json.ownerDisplayName),
      role: readOptionalString(json.role),
      expiresAt,
      ...(workspaceKeyB64 ? { workspaceKeyB64 } : {}),
    }
  } catch {
    return null
  }
}

export function resolveInvitePreview(input: string): {
  parsed: ParsedToolmanInviteUrl
  peeked: PeekedInviteTokenFields | null
  workspaceId?: string
  workspaceName?: string
  hubUrls: string[]
} {
  const parsed = parseToolmanInviteUrl(input)
  const peeked = parsed.token ? peekInviteTokenFields(parsed.token) : null
  return {
    parsed,
    peeked,
    workspaceId: parsed.workspaceId ?? peeked?.workspaceId,
    workspaceName: parsed.workspaceName ?? peeked?.workspaceName,
    hubUrls: parsed.hubUrls ?? [],
  }
}
