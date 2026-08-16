let currentDataIdentityId: string | null = null
let allowLegacyClaim = false

export const OWNED_STORE_VERSION = 1

export type OwnedStoreEnvelope<T> = {
  v: typeof OWNED_STORE_VERSION
  ownerIdentityId: string
  payload: T
}

export function getCurrentDataIdentity(): string | null {
  return currentDataIdentityId
}

export function scopedStorageKey(baseKey: string, identityId = getCurrentDataIdentity()): string {
  const id = identityId?.trim()
  return id ? `${baseKey}::${id}` : `${baseKey}::anon`
}

export function setCurrentDataIdentity(identityId: string | null): void {
  currentDataIdentityId = identityId?.trim() || null
}

export function setAllowLegacyDataClaim(allow: boolean): void {
  allowLegacyClaim = allow
}

export function isLegacyDataClaimAllowed(): boolean {
  return allowLegacyClaim
}

export function isOwnedStoreEnvelope(value: unknown): value is OwnedStoreEnvelope<unknown> {
  if (!value || typeof value !== 'object') return false
  const rec = value as Record<string, unknown>
  return rec.v === OWNED_STORE_VERSION && typeof rec.ownerIdentityId === 'string' && 'payload' in rec
}

/** Only the signed-in identity may read a private store. Unstamped leftovers are ignored. */
export function parseOwnedPayload<T>(
  raw: string | null,
  identityId = getCurrentDataIdentity(),
): T | null {
  if (!raw || !identityId?.trim()) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isOwnedStoreEnvelope(parsed)) return null
    if (parsed.ownerIdentityId !== identityId.trim()) return null
    return parsed.payload as T
  } catch {
    return null
  }
}

export function stringifyOwnedPayload<T>(
  payload: T,
  identityId = getCurrentDataIdentity(),
): string {
  const owner = identityId?.trim() || 'anon'
  const envelope: OwnedStoreEnvelope<T> = {
    v: OWNED_STORE_VERSION,
    ownerIdentityId: owner,
    payload,
  }
  return JSON.stringify(envelope)
}

export function unwrapOwnedValue<T>(
  value: unknown,
  identityId = getCurrentDataIdentity(),
): T | null {
  const id = identityId?.trim()
  if (!id || !isOwnedStoreEnvelope(value) || value.ownerIdentityId !== id) return null
  return value.payload as T
}

export function wrapOwnedValue<T>(
  payload: T,
  identityId = getCurrentDataIdentity(),
): OwnedStoreEnvelope<T> {
  return {
    v: OWNED_STORE_VERSION,
    ownerIdentityId: identityId?.trim() || 'anon',
    payload,
  }
}
