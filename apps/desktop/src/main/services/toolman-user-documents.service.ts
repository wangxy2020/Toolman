import { existsSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { app } from 'electron'
import { identities } from '@toolman/db'
import { getDatabase } from '../bootstrap/database'

const DEFAULT_IDENTITY_ID = '00000000-0000-0000-0000-000000000001'

export function sanitizeUserFolderName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '本地用户'
  const sanitized = trimmed.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim()
  return sanitized || '本地用户'
}

export function getToolmanUserFolderName(): string {
  try {
    const row = getDatabase()
      .select({ displayName: identities.displayName })
      .from(identities)
      .where(eq(identities.id, DEFAULT_IDENTITY_ID))
      .get()
    if (row?.displayName?.trim()) {
      return sanitizeUserFolderName(row.displayName)
    }
  } catch {
    // Database may not be ready in some test contexts.
  }
  return sanitizeUserFolderName(os.userInfo().username)
}

const TOOLMAN_DOCUMENTS_DIR = 'Toolman'
const TOOLMAN_DATA_DOCUMENTS_DIR = 'ToolmanData'

export function getToolmanDocumentsRootPath(): string {
  const envRoot = process.env.TOOLMAN_DOCS_ROOT?.trim()
  if (envRoot) {
    return envRoot
  }

  const documents = app.getPath('documents')
  const toolmanRoot = join(documents, TOOLMAN_DOCUMENTS_DIR)
  const toolmanDataRoot = join(documents, TOOLMAN_DATA_DOCUMENTS_DIR)

  if (shouldUseToolmanDataDocumentsRoot(toolmanRoot)) {
    return toolmanDataRoot
  }

  return toolmanRoot
}

/** The other Documents root kept for legacy path detection and one-time migration. */
export function getAlternateToolmanDocumentsRoot(): string {
  const documents = app.getPath('documents')
  const active = getToolmanDocumentsRootPath()
  const toolmanRoot = join(documents, TOOLMAN_DOCUMENTS_DIR)
  const toolmanDataRoot = join(documents, TOOLMAN_DATA_DOCUMENTS_DIR)
  return normalizeFolderPath(active) === normalizeFolderPath(toolmanDataRoot)
    ? toolmanRoot
    : toolmanDataRoot
}

/** All roots that may contain legacy flat or user-scoped Toolman folders. */
export function listAllToolmanDocumentsRoots(): string[] {
  const active = getToolmanDocumentsRootPath()
  const alternate = getAlternateToolmanDocumentsRoot()
  if (normalizeFolderPath(active) === normalizeFolderPath(alternate)) {
    return [active]
  }
  return [active, alternate]
}

function shouldUseToolmanDataDocumentsRoot(toolmanRoot: string): boolean {
  if (!app.isPackaged) {
    return true
  }
  return isDevRepositoryRoot(toolmanRoot)
}

function isDevRepositoryRoot(path: string): boolean {
  return (
    existsSync(join(path, '.git')) ||
    existsSync(join(path, 'pnpm-workspace.yaml'))
  )
}

export function isPathUnderToolmanDocumentsRoot(
  path: string,
  root = getToolmanDocumentsRootPath(),
): boolean {
  const normalized = normalizeFolderPath(path)
  const normalizedRoot = normalizeFolderPath(root)
  return normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}/`)
}

export function isAlternateToolmanDocumentsPath(
  path: string,
  userFolderName = getToolmanUserFolderName(),
): boolean {
  const normalized = normalizeFolderPath(path)
  const prefix = normalizeFolderPath(join(getAlternateToolmanDocumentsRoot(), userFolderName))
  return normalized === prefix || normalized.startsWith(`${prefix}/`)
}

/** ~/Documents/Toolman/{username}/ */
export function getToolmanUserRootPath(): string {
  return join(getToolmanDocumentsRootPath(), getToolmanUserFolderName())
}

export function getDefaultWorkspaceFolderPath(): string {
  return join(getToolmanUserRootPath(), '工作区')
}

export function getDefaultKnowledgeFolderPath(): string {
  return join(getToolmanUserRootPath(), '本地知识库')
}

/** Previous flat default before per-user nesting. */
export function getFlatDefaultKnowledgeFolderPath(): string {
  return join(getToolmanDocumentsRootPath(), '本地知识库')
}

/** Previous default before renaming to 本地知识库. */
export function getLegacyDefaultKnowledgeFolderPath(): string {
  return join(getToolmanDocumentsRootPath(), '知识库')
}

export function getDefaultNetworkKnowledgeFolderPath(): string {
  return join(getToolmanUserRootPath(), '网络知识库')
}

export function getDefaultSharedKnowledgeFolderPath(): string {
  return join(getToolmanUserRootPath(), '共享知识库')
}

export function getDefaultLocalFilesFolderPath(): string {
  return join(getToolmanUserRootPath(), '本地文件')
}

export const TOOLMAN_USER_DOCUMENT_SUBFOLDERS = [
  '工作区',
  '本地知识库',
  '网络知识库',
  '共享知识库',
  '本地文件',
] as const

/** Create the active user document root and standard subfolders (never the alternate root). */
export function ensureToolmanUserDocumentFolders(): string {
  ensureDirectoryExists(getToolmanDocumentsRootPath())
  const root = getToolmanUserRootPath()
  ensureDirectoryExists(root)
  for (const subfolder of TOOLMAN_USER_DOCUMENT_SUBFOLDERS) {
    ensureDirectoryExists(join(root, subfolder))
  }
  return root
}

export function normalizeFolderPath(path: string): string {
  return join(path).replace(/\\/g, '/')
}

export function isUserScopedToolmanPath(path: string, userFolderName = getToolmanUserFolderName()): boolean {
  const normalized = normalizeFolderPath(path)
  const prefix = normalizeFolderPath(join(getToolmanDocumentsRootPath(), userFolderName))
  return normalized === prefix || normalized.startsWith(`${prefix}/`)
}

/** Detect flat Toolman paths like ~/Documents/Toolman/本地知识库 or ~/Documents/Toolman/用户1本地知识库 */
export function resolveFlatToolmanSubfolder(path: string): string | null {
  const normalized = normalizeFolderPath(path)

  for (const root of listAllToolmanDocumentsRoots()) {
    const normalizedRoot = normalizeFolderPath(root)
    if (!normalized.startsWith(`${normalizedRoot}/`)) continue

    const rest = normalized.slice(normalizedRoot.length + 1)
    if (!rest || rest.includes('/')) continue

    const known: Record<string, string> = {
      工作区: '工作区',
      本地知识库: '本地知识库',
      知识库: '本地知识库',
      网络知识库: '网络知识库',
      共享知识库: '共享知识库',
      本地文件: '本地文件',
    }
    if (known[rest]) return known[rest]

    for (const suffix of ['本地知识库', '网络知识库', '共享知识库', '本地文件'] as const) {
      if (rest.endsWith(suffix) && rest.length > suffix.length) {
        return suffix
      }
    }
  }

  return null
}

export function listFlatToolmanPathCandidates(subfolder: string): string[] {
  const userName = getToolmanUserFolderName()
  const candidates: string[] = []
  for (const root of listAllToolmanDocumentsRoots()) {
    candidates.push(join(root, subfolder))
    if (subfolder === '本地知识库') {
      candidates.push(join(root, '知识库'), join(root, `${userName}本地知识库`))
    }
  }
  return candidates
}

export function shouldMigrateDocumentsWorkspaceFolder(resolvedPath: string): boolean {
  const documents = normalizeFolderPath(app.getPath('documents'))
  return normalizeFolderPath(resolvedPath) === documents
}

/** Paths that must never be renamed or used as bulk path-rewrite prefixes. */
export function isNonMigratableFolderPath(path: string): boolean {
  const normalized = normalizeFolderPath(path)
  const protectedPaths = [
    normalizeFolderPath(app.getPath('home')),
    normalizeFolderPath(app.getPath('documents')),
    normalizeFolderPath(app.getPath('desktop')),
    normalizeFolderPath(app.getPath('downloads')),
    ...listAllToolmanDocumentsRoots().map((root) => normalizeFolderPath(root)),
  ]
  return protectedPaths.includes(normalized)
}

export function ensureDirectoryExists(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}
