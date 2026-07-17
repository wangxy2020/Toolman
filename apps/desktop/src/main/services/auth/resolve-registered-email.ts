import { AuthBindingRepository, type AuthBindingMetadata } from '@toolman/db'

import { getDatabase } from '../../bootstrap/database'
import { getAuthSession } from '../auth-session.service'

function parseBindingMetadata(raw: string): AuthBindingMetadata {
  try {
    return JSON.parse(raw) as AuthBindingMetadata
  } catch {
    return {}
  }
}

/** Accept only a full, unmasked email (reject `he***@example.com`). */
export function normalizeRegisteredEmail(value?: string | null): string | undefined {
  const trimmed = value?.trim().toLowerCase()
  if (!trimmed || !trimmed.includes('@') || trimmed.includes('*')) return undefined
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return undefined
  return trimmed
}

/** Accept an unmasked phone / account id for community display. */
export function normalizeRegisteredPhone(value?: string | null): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed || trimmed.includes('*')) return undefined
  const digits = trimmed.replace(/[^\d+]/g, '')
  if (digits.replace(/\D/g, '').length < 6) return undefined
  return trimmed
}

/**
 * Resolve the account's registration email for community display / hub JWT.
 * Prefers binding metadata.email, then an unmasked label containing `@`.
 */
export function resolveRegisteredEmail(identityId?: string): string | undefined {
  const session = getAuthSession()
  const resolvedIdentityId = identityId ?? session.identityId
  const db = getDatabase()
  const rows = new AuthBindingRepository(db).listByIdentityId(resolvedIdentityId)

  for (const row of rows) {
    const metadata = parseBindingMetadata(row.metadataJson)
    const fromMetadata = normalizeRegisteredEmail(metadata.email)
    if (fromMetadata) return fromMetadata
    const fromLabel = normalizeRegisteredEmail(metadata.label)
    if (fromLabel) return fromLabel
  }

  for (const binding of session.bindings) {
    const fromLabel = normalizeRegisteredEmail(binding.label)
    if (fromLabel) return fromLabel
  }

  return undefined
}

/**
 * Registered account name shown in community (email preferred, then phone).
 */
export function resolveRegisteredAccountDisplayName(identityId?: string): string | undefined {
  const email = resolveRegisteredEmail(identityId)
  if (email) return email

  const session = getAuthSession()
  const resolvedIdentityId = identityId ?? session.identityId
  const db = getDatabase()
  const rows = new AuthBindingRepository(db).listByIdentityId(resolvedIdentityId)

  for (const row of rows) {
    const metadata = parseBindingMetadata(row.metadataJson)
    const fromPhone = normalizeRegisteredPhone(metadata.phone)
    if (fromPhone) return fromPhone
    const fromLabel = normalizeRegisteredPhone(metadata.label)
    if (fromLabel) return fromLabel
  }

  for (const binding of session.bindings) {
    const fromLabel = normalizeRegisteredPhone(binding.label)
    if (fromLabel) return fromLabel
  }

  return undefined
}
