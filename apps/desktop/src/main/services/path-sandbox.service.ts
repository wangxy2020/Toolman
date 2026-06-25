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

export function isPathWithinAllowedRoots(inputPath: string): boolean {
  const trimmed = inputPath.trim()
  if (!trimmed) return false

  try {
    assertPathWithinAllowedRoots(trimmed)
    return true
  } catch {
    return false
  }
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

export function assertPathWithinAllowedRoots(inputPath: string): string {
  const trimmed = inputPath.trim()
  if (!trimmed) {
    throw new PathSandboxError('路径不能为空')
  }

  const target = resolve(trimmed)
  for (const root of collectAllowedPathRoots()) {
    if (isPathUnderRoot(target, root)) {
      return existsSync(target) ? realpathSync.native(target) : target
    }
  }

  throw new PathSandboxError(
    `路径不在允许访问的范围内：${normalizeFolderPath(trimmed)}`,
  )
}

export function assertPathsWithinAllowedRoots(paths: readonly string[]): string[] {
  return paths.map((path) => assertPathWithinAllowedRoots(path))
}
