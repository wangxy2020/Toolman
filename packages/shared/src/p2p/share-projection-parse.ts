import type { P2pAgentSessionPermission, P2pSharedResourcePermission } from './types.js'

export function readString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function readNumber(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function readPermission(value: unknown): P2pSharedResourcePermission | undefined {
  if (value === 'read' || value === 'write' || value === 'admin') return value
  return undefined
}

export function readSessionPermission(value: unknown): P2pAgentSessionPermission {
  return value === 'callable' ? 'callable' : 'read'
}

export function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const ids = value.filter((item): item is string => typeof item === 'string' && item.length > 0)
  return [...new Set(ids)]
}

export function readStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const next: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'string' && entry.trim()) next[key] = entry
  }
  return next
}

export function parseSharePayload(payloadJson: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(payloadJson) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

export function notePermission(
  value: P2pSharedResourcePermission | undefined,
): 'read' | 'write' | undefined {
  if (value === 'write' || value === 'admin') return 'write'
  if (value === 'read') return 'read'
  return undefined
}
