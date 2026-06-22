import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import {
  buildP2pGroupSavedKnowledgeDescription,
  buildP2pGroupSavedKnowledgeDisplayName,
  isP2pSharedKnowledgeMirrorDescription,
  normalizeP2pGroupSavedKnowledgeMeta,
  parseP2pGroupSavedKnowledgeMeta,
} from '@toolman/shared'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../../db/repos'
import { ensureWorkspaceSharedKnowledgeFolder } from '../knowledge-folder.service'
import { resolveKnowledgeBaseStoragePath } from '../knowledge-kb-storage-path.service'
import { ensureKnowledgeBaseStorageSource } from '../knowledge-kb-storage-source.service'
import { restartKnowledgeWatchersForKb } from '../knowledge-watcher.service'
import { normalizeFolderPath } from '../toolman-user-documents.service'

function isPathInsideFolder(folderPath: string, filePath: string): boolean {
  const root = resolve(folderPath)
  const target = resolve(filePath)
  return target === root || target.startsWith(`${root}${sep}`)
}

function moveFileIfNeeded(sourcePath: string, destinationPath: string): boolean {
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

function moveRootLevelFiles(sourceRoot: string, destinationRoot: string): void {
  if (!existsSync(sourceRoot)) return
  if (normalizeFolderPath(sourceRoot) === normalizeFolderPath(destinationRoot)) return

  mkdirSync(destinationRoot, { recursive: true })
  for (const entry of readdirSync(sourceRoot)) {
    const sourcePath = join(sourceRoot, entry)
    if (!statSync(sourcePath).isFile()) continue
    moveFileIfNeeded(sourcePath, join(destinationRoot, entry))
  }
}

function migrateDocumentsInKbToStoragePath(
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

function isLegacyFlatGroupSavedKnowledgeBase(row: {
  name: string
  kind: string
  description: string | null
}): boolean {
  if (row.kind !== 'shared' || isP2pSharedKnowledgeMirrorDescription(row.description)) {
    return false
  }
  return parseP2pGroupSavedKnowledgeMeta(row.description) == null
}

function resolveLegacyGroupSavedMeta(row: {
  name: string
  description: string | null
}): { groupName: string; sharedFolderName: string } | null {
  const bracketMatch = row.name.trim().match(/^\[([^\]]+)\]\s+(.+)$/)
  if (bracketMatch) {
    return normalizeP2pGroupSavedKnowledgeMeta(bracketMatch[1] ?? '', bracketMatch[2] ?? '')
  }

  const plainName = row.name.trim()
  if (!plainName) return null
  return normalizeP2pGroupSavedKnowledgeMeta(plainName, '共享文件夹')
}

function collectLegacyStoragePaths(
  sharedRoot: string,
  rowName: string,
  meta: { groupName: string; sharedFolderName: string },
): string[] {
  const paths = new Set<string>()
  paths.add(join(sharedRoot, rowName))
  paths.add(join(sharedRoot, meta.groupName))
  paths.add(join(sharedRoot, meta.groupName, meta.sharedFolderName))
  return [...paths]
}

export function migrateLegacyGroupSavedKnowledgeBases(workspaceId: string): number {
  const kbRepo = getKnowledgeBaseRepository()
  const sharedRoot = ensureWorkspaceSharedKnowledgeFolder({ workspaceId })
  let migrated = 0

  for (const row of kbRepo.listByWorkspace(workspaceId)) {
    if (!isLegacyFlatGroupSavedKnowledgeBase(row)) continue

    const legacyMeta = resolveLegacyGroupSavedMeta(row)
    if (!legacyMeta) continue

    const displayName = buildP2pGroupSavedKnowledgeDisplayName(
      legacyMeta.groupName,
      legacyMeta.sharedFolderName,
    )
    const description = buildP2pGroupSavedKnowledgeDescription(legacyMeta)

    kbRepo.update({
      id: row.id,
      workspaceId,
      name: displayName,
      description,
    })

    const updated = kbRepo.findRowById(row.id, workspaceId)
    if (!updated) continue

    const targetStoragePath = resolveKnowledgeBaseStoragePath(updated, { ensure: true })
    if (!targetStoragePath) continue

    for (const legacyPath of collectLegacyStoragePaths(sharedRoot, row.name, legacyMeta)) {
      moveRootLevelFiles(legacyPath, targetStoragePath)
    }

    migrateDocumentsInKbToStoragePath(row.id, workspaceId, targetStoragePath)
    migrated += 1
  }

  for (const row of kbRepo.listByWorkspace(workspaceId)) {
    const meta = parseP2pGroupSavedKnowledgeMeta(row.description)
    if (!meta || row.kind !== 'shared' || isP2pSharedKnowledgeMirrorDescription(row.description)) {
      continue
    }

    const nestedLegacyPath = join(sharedRoot, meta.groupName, meta.sharedFolderName)
    const targetStoragePath = resolveKnowledgeBaseStoragePath(row, { ensure: true })
    if (!targetStoragePath) continue

    moveRootLevelFiles(nestedLegacyPath, targetStoragePath)
    migrateDocumentsInKbToStoragePath(row.id, workspaceId, targetStoragePath)
  }

  return migrated
}

export async function migrateAllLegacyGroupSavedKnowledgeBases(): Promise<{ migratedKbCount: number }> {
  const kbRepo = getKnowledgeBaseRepository()
  const workspaceIds = new Set<string>()
  for (const row of kbRepo.listAllActive()) {
    workspaceIds.add(row.workspaceId)
  }

  let migratedKbCount = 0
  for (const workspaceId of workspaceIds) {
    migratedKbCount += migrateLegacyGroupSavedKnowledgeBases(workspaceId)
  }

  return { migratedKbCount }
}
