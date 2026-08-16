/**
 * Resolve the identity string used for Community Hub `device_sync` buckets.
 * Must match across desktop and mobile so the same account shares one changelog.
 */

export type DeviceSyncIdentityBinding = {
  provider: string
  subjectId: string
}

const AUTHING_USER_ID_RE = /^[a-f0-9]{24}$/i

export function looksLikeAuthingUserId(subjectId: string): boolean {
  return AUTHING_USER_ID_RE.test(subjectId.trim())
}

/**
 * Prefer Firebase `fb-{uid}` / Authing `ag-{userId}` over the desktop guest UUID
 * so WAN device_sync matches mobile Authing/Firebase sessions.
 */
export function resolveDeviceSyncIdentityId(input: {
  bindings?: ReadonlyArray<DeviceSyncIdentityBinding> | null
  fallbackIdentityId: string
}): string {
  const fallback = input.fallbackIdentityId.trim()
  const bindings = input.bindings ?? []

  for (const binding of bindings) {
    if (
      binding.provider === 'firebase_email' ||
      binding.provider === 'firebase_google' ||
      binding.provider === 'firebase_apple'
    ) {
      const subject = binding.subjectId.trim()
      if (subject) return `fb-${subject}`
    }
  }

  for (const binding of bindings) {
    const subject = binding.subjectId.trim()
    if (looksLikeAuthingUserId(subject)) return `ag-${subject}`
  }

  // Mobile already stores `ag-…` / `fb-…` as the primary identityId.
  if (fallback.startsWith('ag-') || fallback.startsWith('fb-')) return fallback

  return fallback
}
