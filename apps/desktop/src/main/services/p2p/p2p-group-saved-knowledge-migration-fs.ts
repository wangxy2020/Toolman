import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, statSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import { getDocumentRepository } from '../../db/repos'
import { ensureKnowledgeBaseStorageSource } from '../knowledge-kb-storage-source.service'
import { restartKnowledgeWatchersForKb } from '../knowledge-watcher.service'
import { normalizeFolderPath } from '../toolman-user-documents.service'

export function isPathInsideFolder(folderPath: string, filePath: string): boolean {
  const root = resolve(folderPath)
  const target = resolve(filePath)
  return target === root || target.startsWith(`${root}${sep}`)
}

export function moveFileIfNeeded(sourcePath: string, destinationPath: string): boolean {
  if (
    !existsSync(sourcePath) ||
    normalizeFolderPath(sourcePath) === normalizeFolderPath(destinationPath)
  ) {
    return existsSync(destinationPath)
  }
  if (existsSync(destinationPath)) {
    return true
  }
  mkdirSync(resolve(destinationPath, '..'), { recursive: true })
  try {
    renameSync(sourcePath, destinationPath)
    return true
  } catch {
    return existsSync(destinationPath)
  }
}

export function moveRootLevelFiles(sourceRoot: string, destinationRoot: string): void {
  if (!existsSync(sourceRoot)) return
  if (normalizeFolderPath(sourceRoot) === normalizeFolderPath(destinationRoot)) return

  mkdirSync(destinationRoot, { recursive: true })
  for (const entry of readdirSync(sourceRoot)) {
    const sourcePath = join(sourceRoot, entry)
    if (!statSync(sourcePath).isFile()) continue
    moveFileIfNeeded(sourcePath, join(destinationRoot, entry))
  }
}

export function removeEmptyDirectory(path: string): void {
  if (!existsSync(path)) return
  try {
    if (readdirSync(path).length === 0) {
      rmdirSync(path)
    }
  } catch {
    // ignore cleanup failure
  }
}

export function migrateDocumentsInKbToStoragePath(
  kbId: string,
  workspaceId: string,
  targetStoragePath: string,
): void {
  const docRepo = getDocumentRepository()
  mkdirSync(targetStoragePath, { recursive: true })

  for (const doc of docRepo.listByKb(kbId)) {
    if (!doc.absolutePath) continue
    const resolved = resolve(doc.absolutePath)
    if (isPathInsideFolder(targetStoragePath, resolved)) continue

    const dest = join(targetStoragePath, basename(resolved))
    if (moveFileIfNeeded(resolved, dest)) {
      docRepo.update(doc.id, kbId, { absolutePath: dest })
    }
  }

  ensureKnowledgeBaseStorageSource(workspaceId, kbId, targetStoragePath)
  restartKnowledgeWatchersForKb(workspaceId, kbId)
}
