import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import {
  AuthBindingRepository,
  AuthSessionRepository,
  type AuthBindingMetadata,
} from '@toolman/db'

import { getDatabase } from '../bootstrap/database'
import {
  DEFAULT_LOCAL_IDENTITY_ID,
  getLocalIdentityId,
  P2P_DEV_USER_B_IDENTITY_ID,
} from './local-identity'
import { sanitizeUserFolderName } from './toolman-folder-sanitize'

const DOCUMENTS_FOLDER_SLUG_FILE = 'documents-folder-slug.json'

/** Folder name for unlogged-in users under ~/Documents/ToolmanData/. */
export const GUEST_DOCUMENTS_FOLDER_SLUG = '本地用户'

export type DocumentsFolderSlugSource = 'persisted' | 'auth' | 'guest'

export interface DocumentsFolderSlugRecord {
  slug: string
  source: DocumentsFolderSlugSource
  createdAt: number
}

let cachedSlug: string | null = null

function slugStorePath(): string {
  return join(app.getPath('userData'), DOCUMENTS_FOLDER_SLUG_FILE)
}

function parseBindingMetadata(raw: string): AuthBindingMetadata {
  try {
    return JSON.parse(raw) as AuthBindingMetadata
  } catch {
    return {}
  }
}

function accountLabelToFolderSlug(label: string): string | null {
  const trimmed = label.trim()
  if (!trimmed) return null

  if (trimmed.includes('@')) {
    const local = trimmed.split('@')[0]?.trim()
    if (local) return sanitizeUserFolderName(local.toLowerCase())
  }

  const digits = trimmed.replace(/\D/g, '')
  if (digits.length >= 10) {
    return sanitizeUserFolderName(digits)
  }

  return sanitizeUserFolderName(trimmed)
}

function accountSubjectToFolderSlug(provider: string, subjectId: string): string | null {
  const trimmed = subjectId.trim()
  if (!trimmed) return null

  if (trimmed.includes('@')) {
    const local = trimmed.split('@')[0]?.trim()
    if (local) return sanitizeUserFolderName(local.toLowerCase())
  }

  if (provider.includes('phone') || /^\+?\d{10,}$/.test(trimmed)) {
    const digits = trimmed.replace(/\D/g, '')
    if (digits.length >= 10) return sanitizeUserFolderName(digits)
  }

  return sanitizeUserFolderName(trimmed.slice(0, 32))
}

export function deriveFolderSlugFromAccountLabel(label: string): string | null {
  return accountLabelToFolderSlug(label)
}

export function deriveFolderSlugFromAuthSubject(provider: string, subjectId: string): string | null {
  return accountSubjectToFolderSlug(provider, subjectId)
}

/**
 * Unlogged-in folder name — always 本地用户 (display name is ignored).
 * Dual P2P dev without isolated TOOLMAN_DOCS_ROOT: 本地用户-a / 本地用户-b.
 * Optional override: TOOLMAN_DOCS_USER_SLUG.
 */
export function computeGuestDocumentsFolderSlug(identityId: string = getLocalIdentityId()): string {
  const envOverride = process.env.TOOLMAN_DOCS_USER_SLUG?.trim()
  if (envOverride) {
    return sanitizeUserFolderName(envOverride)
  }

  if (process.env.TOOLMAN_DEV_IDENTITY_ID?.trim() && !process.env.TOOLMAN_DOCS_ROOT?.trim()) {
    if (identityId === P2P_DEV_USER_B_IDENTITY_ID) {
      return `${GUEST_DOCUMENTS_FOLDER_SLUG}-b`
    }
    if (identityId === DEFAULT_LOCAL_IDENTITY_ID) {
      return `${GUEST_DOCUMENTS_FOLDER_SLUG}-a`
    }
    const compact = identityId.replace(/-/g, '').toLowerCase()
    return `${GUEST_DOCUMENTS_FOLDER_SLUG}-${compact.slice(-8)}`
  }

  return GUEST_DOCUMENTS_FOLDER_SLUG
}

export function guestFolderSlugFromIdentityId(identityId: string = getLocalIdentityId()): string {
  return computeGuestDocumentsFolderSlug(identityId)
}

function isAuthSessionLoggedIn(): boolean {
  try {
    const session = new AuthSessionRepository(getDatabase()).getCurrent()
    return Boolean(session?.isLoggedIn)
  } catch {
    return false
  }
}

/** Primary login account (email local-part), only when session is logged in. */
export function resolveAuthAccountDocumentsFolderSlug(): string | null {
  if (!isAuthSessionLoggedIn()) return null

  try {
    const bindingRepo = new AuthBindingRepository(getDatabase())
    const bindings = bindingRepo.listByIdentityId(getLocalIdentityId())
    if (bindings.length === 0) return null

    const sorted = [...bindings].sort(
      (left, right) => right.verifiedAt.getTime() - left.verifiedAt.getTime(),
    )

    for (const binding of sorted) {
      const metadata = parseBindingMetadata(binding.metadataJson)
      if (metadata.email) {
        const fromEmail = accountLabelToFolderSlug(metadata.email)
        if (fromEmail) return fromEmail
      }
      const fromLabel = metadata.label ? accountLabelToFolderSlug(metadata.label) : null
      if (fromLabel) return fromLabel

      const fromSubject = accountSubjectToFolderSlug(binding.provider, binding.subjectId)
      if (fromSubject) return fromSubject
    }
  } catch {
    return null
  }

  return null
}

export function computeExpectedDocumentsFolderSlug(): DocumentsFolderSlugRecord {
  const authSlug = resolveAuthAccountDocumentsFolderSlug()
  if (authSlug) {
    return { slug: authSlug, source: 'auth', createdAt: Date.now() }
  }

  return {
    slug: computeGuestDocumentsFolderSlug(),
    source: 'guest',
    createdAt: Date.now(),
  }
}

function readPersistedDocumentsFolderSlugRecord(): DocumentsFolderSlugRecord | null {
  const path = slugStorePath()
  if (!existsSync(path)) return null

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<DocumentsFolderSlugRecord>
    const slug = sanitizeUserFolderName(String(parsed.slug ?? ''))
    if (!slug) return null
    const source = parsed.source === 'auth' || parsed.source === 'guest' ? parsed.source : 'persisted'
    return {
      slug,
      source,
      createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
    }
  } catch {
    return null
  }
}

function writePersistedDocumentsFolderSlugRecord(record: DocumentsFolderSlugRecord): void {
  const path = slugStorePath()
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
  resetDocumentsFolderSlugCache()
}

export function getDocumentsFolderSlugRecord(): DocumentsFolderSlugRecord {
  const expected = computeExpectedDocumentsFolderSlug()
  const persisted = readPersistedDocumentsFolderSlugRecord()

  if (!persisted) {
    writePersistedDocumentsFolderSlugRecord(expected)
    return expected
  }

  // Slug changes are persisted only via syncDocumentsFolderSlugWithAccount (includes folder migration).
  if (persisted.slug !== expected.slug || persisted.source !== expected.source) {
    return expected
  }

  return persisted
}

export function syncDocumentsFolderSlugWithAccount(): boolean {
  resetDocumentsFolderSlugCache()
  const persisted = readPersistedDocumentsFolderSlugRecord()
  const expected = computeExpectedDocumentsFolderSlug()
  if (persisted?.slug === expected.slug && persisted.source === expected.source) {
    return false
  }

  if (persisted?.slug && persisted.slug !== expected.slug) {
    const { migrateToolmanUserFolderBetweenSlugs } =
      require('./knowledge-folder.service') as typeof import('./knowledge-folder.service')
    migrateToolmanUserFolderBetweenSlugs(persisted.slug, expected.slug)
  }

  writePersistedDocumentsFolderSlugRecord(expected)
  return true
}

/** Stable ToolmanData subfolder name; guest slug or auth email prefix. */
export function getDocumentsFolderSlug(): string {
  if (cachedSlug) return cachedSlug
  const record = getDocumentsFolderSlugRecord()
  cachedSlug = record.slug
  return record.slug
}

export function resetDocumentsFolderSlugCache(): void {
  cachedSlug = null
}
