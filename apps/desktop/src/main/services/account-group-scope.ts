import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { getDocumentsFolderSlug } from './documents-folder-slug.service'

export interface AccountDataScopeFile {
  workspaces: Record<string, string>
  groups: Record<string, string>
}

const SCOPE_FILE = 'account-data-scope.json'

function emptyScope(): AccountDataScopeFile {
  return { workspaces: {}, groups: {} }
}

function scopePath(): string {
  return join(app.getPath('userData'), SCOPE_FILE)
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  const record: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' && item.trim()) record[key] = item
  }
  return record
}

export function readAccountDataScope(): AccountDataScopeFile {
  const path = scopePath()
  if (!existsSync(path)) return emptyScope()
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<AccountDataScopeFile>
    return {
      workspaces: asStringRecord(parsed.workspaces),
      groups: asStringRecord(parsed.groups),
    }
  } catch {
    return emptyScope()
  }
}

export function writeAccountDataScope(scope: AccountDataScopeFile): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(scopePath(), `${JSON.stringify(scope, null, 2)}\n`, 'utf8')
}

export function stampMissingGroups(
  scope: AccountDataScopeFile,
  groupIds: string[],
  slug: string,
): void {
  for (const groupId of groupIds) {
    if (!groupId || scope.groups[groupId]) continue
    scope.groups[groupId] = slug
  }
}

export function groupVisibleForCurrentAccount(groupId: string): boolean {
  const assigned = readAccountDataScope().groups[groupId]
  if (!assigned) return true
  try {
    return assigned === getDocumentsFolderSlug()
  } catch {
    return true
  }
}

export function assignGroupToCurrentAccount(groupId: string): void {
  try {
    const slug = getDocumentsFolderSlug()
    const scope = readAccountDataScope()
    if (scope.groups[groupId]) return
    scope.groups[groupId] = slug
    writeAccountDataScope(scope)
  } catch {
    // Auth slug is unavailable before the database is ready.
  }
}
