/**
 * Active-account scope helpers for clean multi-login isolation on one device.
 * Slug + default workspace remain the source of truth; this module derives paths
 * and rebinds main-process services when the active account changes.
 */
import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { getDocumentsFolderSlug } from './documents-folder-slug.service'
import { sanitizeUserFolderName } from './toolman-folder-sanitize'
import { getDefaultWorkspace } from './workspace.service'
import { logStructured } from './structured-log.service'
import { toErrorMessage } from '@toolman/shared'

export type ActiveAccountScope = {
  slug: string
  workspaceId: string | null
}

export function getActiveAccountSlug(): string {
  return getDocumentsFolderSlug()
}

export function getActiveWorkspaceId(): string | null {
  try {
    return getDefaultWorkspace()?.id ?? null
  } catch {
    return null
  }
}

export function getActiveAccountScope(): ActiveAccountScope {
  return {
    slug: getActiveAccountSlug(),
    workspaceId: getActiveWorkspaceId(),
  }
}

/** `{userData}/by-account/{slug}/...` — account-private app files. */
export function accountScopedUserDataPath(...parts: string[]): string {
  const slug = sanitizeUserFolderName(getActiveAccountSlug()) || 'local'
  return join(app.getPath('userData'), 'by-account', slug, ...parts)
}

/**
 * Prefer the account-scoped path; if missing, adopt a legacy device-global file once.
 */
export function resolveAccountScopedFileWithLegacyAdopt(
  scopedParts: string[],
  legacyParts: string[],
): string {
  const scoped = accountScopedUserDataPath(...scopedParts)
  if (existsSync(scoped)) return scoped
  const legacy = join(app.getPath('userData'), ...legacyParts)
  if (existsSync(legacy)) {
    try {
      mkdirSync(dirname(scoped), { recursive: true })
      renameSync(legacy, scoped)
      logStructured(
        'auth',
        'info',
        `adopted legacy ${legacyParts.join('/')} → by-account/${getActiveAccountSlug()}/`,
      )
    } catch (error) {
      logStructured(
        'auth',
        'warn',
        `legacy adopt failed for ${legacyParts.join('/')}: ${toErrorMessage(error, String(error))}`,
      )
      return legacy
    }
  }
  return scoped
}

export function assertRowInActiveWorkspace(
  workspaceId: string | null | undefined,
  entityLabel = 'resource',
): void {
  const active = getActiveWorkspaceId()
  if (!active) return
  if (!workspaceId || workspaceId !== active) {
    throw new Error(`${entityLabel} 不属于当前账号工作区`)
  }
}

export function isWorkspaceActive(workspaceId: string | null | undefined): boolean {
  const active = getActiveWorkspaceId()
  if (!active) return true
  return Boolean(workspaceId && workspaceId === active)
}

/**
 * Stable internal account key. Today this is the documents folder slug; P2 can
 * migrate to an immutable auth subject hash while keeping slug as the display path.
 */
export function getActiveAccountKey(): string {
  return getActiveAccountSlug()
}
