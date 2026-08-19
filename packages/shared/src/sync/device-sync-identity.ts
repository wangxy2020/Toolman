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

/** Signed-in Authing / Firebase account ids used to isolate private sync. */
export function isAccountSyncIdentityId(identityId?: string | null): boolean {
  const value = identityId?.trim() ?? ''
  return value.startsWith('ag-') || value.startsWith('fb-')
}

/**
 * Prefer Firebase `fb-{uid}` / Authing `ag-{userId}` over the desktop guest UUID
 * so WAN device_sync matches mobile Authing/Firebase sessions.
 */
function accountIdFromSubject(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? ''
  if (!value) return null
  if (isAccountSyncIdentityId(value)) return value
  if (looksLikeAuthingUserId(value)) return `ag-${value}`
  return null
}

export function resolveDeviceSyncIdentityId(input: {
  bindings?: ReadonlyArray<DeviceSyncIdentityBinding> | null
  fallbackIdentityId: string
  extraSubjectIds?: ReadonlyArray<string | null | undefined> | null
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

  for (const extra of input.extraSubjectIds ?? []) {
    const accountId = accountIdFromSubject(extra)
    if (accountId) return accountId
  }

  for (const binding of bindings) {
    const accountId = accountIdFromSubject(binding.subjectId)
    if (accountId) return accountId
  }

  // Mobile already stores `ag-…` / `fb-…` as the primary identityId.
  const fallbackAccount = accountIdFromSubject(fallback)
  if (fallbackAccount) return fallbackAccount

  return fallback
}
