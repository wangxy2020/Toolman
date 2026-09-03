import { existsSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { app } from 'electron'
import { getCommunityDataDir } from './community/community-paths'
import {
  listAllToolmanDocumentsRoots,
  normalizeFolderPath,
} from './toolman-user-documents.service'
import { listWorkspaces } from './workspace.service'

export class PathSandboxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PathSandboxError'
  }
}

export function collectAllowedPathRoots(): string[] {
  // App-managed destinations and workspace folders. User pick/drop/open uses
  // assertUserAccessiblePath instead — those must not be limited to the work folder.
  const roots = new Set<string>([
    app.getPath('userData'),
    getCommunityDataDir(),
    app.getPath('temp'),
    app.getPath('documents'),
    app.getPath('desktop'),
    app.getPath('downloads'),
    ...listAllToolmanDocumentsRoots(),
  ])

  try {
    for (const workspace of listWorkspaces()) {
      const folderPath = workspace.settings.folderPath
      if (typeof folderPath === 'string' && folderPath.trim()) {
        roots.add(resolve(folderPath.trim()))
      }
    }
  } catch {
    // Database may not be ready in some bootstrap contexts.
  }

  return [...roots]
}

function canonicalizePath(path: string): string {
  const normalized = resolve(path)
  let cursor = normalized

  while (!existsSync(cursor)) {
    const parent = resolve(cursor, '..')
    if (parent === cursor) {
      return normalized
    }
    cursor = parent
  }

  const realBase = realpathSync.native(cursor)
  const suffix = relative(cursor, normalized)
  return suffix ? resolve(realBase, suffix) : realBase
}

function isPathUnderRoot(target: string, root: string): boolean {
  const realRoot = canonicalizePath(root)
  const realTarget = canonicalizePath(target)
  const rel = relative(realRoot, realTarget)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function resolveCheckedPath(inputPath: string): string {
  const trimmed = inputPath.trim()
  if (!trimmed) {
    throw new PathSandboxError('路径不能为空')
  }
  const target = canonicalizePath(resolve(trimmed))
  return existsSync(target) ? realpathSync.native(target) : target
}

function collectBlockedSystemRoots(): string[] {
  if (process.platform === 'win32') {
    const windir = process.env.WINDIR?.trim() || 'C:\\Windows'
    return [windir, 'C:\\Program Files\\WindowsApps']
  }

  return [
    '/etc',
    '/private/etc',
    '/System',
    '/bin',
    '/sbin',
    '/usr/bin',
    '/usr/sbin',
    '/usr/libexec',
    '/dev',
    '/proc',
    '/sys',
    '/root',
    '/var/root',
    '/private/var/root',
  ]
}

function isBlockedSystemPath(target: string): boolean {
  return collectBlockedSystemRoots().some((root) => isPathUnderRoot(target, root))
}

function rejectOutsideMessage(inputPath: string): never {
  throw new PathSandboxError(`路径不在允许访问的范围内：${normalizeFolderPath(inputPath.trim())}`)
}

/** App data, workspace folder, and default document roots — not user file pickers. */
export function assertPathWithinAllowedRoots(inputPath: string): string {
  const target = resolveCheckedPath(inputPath)
  for (const root of collectAllowedPathRoots()) {
    if (isPathUnderRoot(target, root)) {
      return target
    }
  }
  rejectOutsideMessage(inputPath)
}

export function assertPathsWithinAllowedRoots(paths: readonly string[]): string[] {
  return paths.map((path) => assertPathWithinAllowedRoots(path))
}

/**
 * User-initiated pick / drop / open. Allows files anywhere the OS user can read,
 * except sensitive system directories. LLM disk tools stay on the workspace folder.
 */
export function assertUserAccessiblePath(inputPath: string): string {
  const target = resolveCheckedPath(inputPath)
  if (isBlockedSystemPath(target)) {
    rejectOutsideMessage(inputPath)
  }
  return target
}

export function assertUserAccessiblePaths(paths: readonly string[]): string[] {
  return paths.map((path) => assertUserAccessiblePath(path))
}
