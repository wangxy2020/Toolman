export const DEFAULT_NAV_AVATAR_LABEL = 'T'

export function getDisplayInitial(displayName: string): string {
  const trimmed = displayName.trim()
  if (!trimmed) return '用'
  const first = Array.from(trimmed)[0]
  return first ?? '用'
}

export function getAvatarFallbackLabel(options: {
  avatarUrl?: string | null
}): string {
  if (options.avatarUrl) return ''
  return DEFAULT_NAV_AVATAR_LABEL
}

export function shortenId(value: string, head = 8, tail = 4): string {
  if (value.length <= head + tail + 1) return value
  return `${value.slice(0, head)}…${value.slice(-tail)}`
}
