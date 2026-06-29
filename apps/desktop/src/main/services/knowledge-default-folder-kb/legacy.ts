import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, statSync, unlinkSync } from 'node:fs'
import { basename, join, relative, resolve, sep } from 'node:path'
import { KnowledgeWatchConfigSchema } from '@toolman/shared'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../../db/repos'
import {
  getToolmanUserFolderName,
  normalizeFolderPath,
} from '../toolman-user-documents.service'
import { renameKnowledgeStorageFolder } from '../knowledge-folder.service'
import { stopKnowledgeWatchersForKb } from '../knowledge-watcher.service'
import {
  DEFAULT_FOLDER_KB_NAME,
  DEFAULT_FOLDER_KB_NAMES,
  LEGACY_DEFAULT_FOLDER_KB_NAMES,
} from './constants'

export function isPathInsideFolder(folderPath: string, filePath: string): boolean {
  const root = resolve(folderPath)
  const target = resolve(filePath)
  return target === root || target.startsWith(`${root}${sep}`)
}

function mergeFolderContents(sourceDir: string, destinationDir: string): void {
  if (!existsSync(sourceDir)) return
  mkdirSync(destinationDir, { recursive: true })
  for (const entry of readdirSync(sourceDir)) {
    const sourcePath = join(sourceDir, entry)
    const destinationPath = join(destinationDir, entry)
    if (existsSync(destinationPath)) continue
    try {
      renameSync(sourcePath, destinationPath)
    } catch {
      // ignore single file move failure
    }
  }
}

function purgeLegacyDefaultDiskFolder(
  workspaceId: string,
  baseFolder: string,
  legacyFolderName: string,
): void {
  const legacyPath = join(baseFolder, legacyFolderName)
  const canonicalPath = join(baseFolder, DEFAULT_FOLDER_KB_NAME)
  if (!existsSync(legacyPath)) return

  mkdirSync(canonicalPath, { recursive: true })
  mergeFolderContents(legacyPath, canonicalPath)
  renameKnowledgeStorageFolder(workspaceId, legacyPath, canonicalPath)

  if (existsSync(legacyPath)) {
    try {
      rmRecursiveIfInside(baseFolder, legacyPath)
    } catch {
      // ignore cleanup failure
    }
  }
}

export function purgeLegacyDefaultDiskFoldersForKind(
  workspaceId: string,
  baseFolder: string,
  kind: keyof typeof DEFAULT_FOLDER_KB_NAMES,
): void {
  if (kind === 'local') return
  purgeLegacyDefaultDiskFolder(workspaceId, baseFolder, LEGACY_DEFAULT_FOLDER_KB_NAMES[kind])
}

export function removeLegacyKnowledgeBaseRows(
  workspaceId: string,
  kind: keyof typeof DEFAULT_FOLDER_KB_NAMES,
): void {
  if (kind === 'local') return

  const legacyName = LEGACY_DEFAULT_FOLDER_KB_NAMES[kind]
  const kbRepo = getKnowledgeBaseRepository()
  const rows = kbRepo.listByWorkspace(workspaceId).filter((row) => row.kind === kind)
  const canonical = rows.find((row) => row.name === DEFAULT_FOLDER_KB_NAME)
  const legacyRows = rows.filter((row) => row.name === legacyName)

  for (const legacy of legacyRows) {
    if (canonical && legacy.id !== canonical.id) {
      stopKnowledgeWatchersForKb(workspaceId, legacy.id)
      kbRepo.softDelete(legacy.id, workspaceId)
      continue
    }
    if (!canonical) {
      kbRepo.update({
        id: legacy.id,
        workspaceId,
        name: DEFAULT_FOLDER_KB_NAME,
      })
    }
  }
}

export function migrateSystemKnowledgeBaseStorageLayout(
  workspaceId: string,
  kbId: string,
  baseFolder: string,
  subfolderName: string,
): void {
  const newStoragePath = join(baseFolder, subfolderName)
  if (normalizeFolderPath(baseFolder) === normalizeFolderPath(newStoragePath)) {
    return
  }

  mkdirSync(newStoragePath, { recursive: true })

  const docRepo = getDocumentRepository()
  const kbRepo = getKnowledgeBaseRepository()

  for (const doc of docRepo.listByKb(kbId)) {
    if (!doc.absolutePath) continue
    const resolved = resolve(doc.absolutePath)
    const root = resolve(baseFolder)
    if (!isPathInsideFolder(root, resolved)) continue

    const rel = relative(root, resolved)
    if (rel === subfolderName || rel.startsWith(`${subfolderName}${sep}`)) continue
    if (rel.includes(sep)) continue

    const dest = join(newStoragePath, basename(resolved))
    if (
      existsSync(resolved) &&
      normalizeFolderPath(resolved) !== normalizeFolderPath(dest) &&
      !existsSync(dest)
    ) {
      try {
        renameSync(resolved, dest)
      } catch {
        continue
      }
    }
    if (existsSync(dest)) {
      docRepo.update(doc.id, kbId, { absolutePath: dest })
      docRepo.renameFileRegistryPath(workspaceId, resolved, dest)
    }
  }

  const kb = kbRepo.findRowById(kbId, workspaceId)
  if (kb) {
    try {
      const parsed = KnowledgeWatchConfigSchema.parse(JSON.parse(kb.watchConfigJson))
      let changed = false
      const paths = parsed.paths?.map((path) => {
        if (normalizeFolderPath(path) === normalizeFolderPath(baseFolder)) {
          changed = true
          return newStoragePath
        }
        return path
      })
      if (changed) {
        kbRepo.update({
          id: kbId,
          workspaceId,
          watchConfigJson: JSON.stringify({ ...parsed, paths }),
        })
      }
    } catch {
      // ignore invalid watch config
    }
  }
}

function rmRecursiveIfInside(allowedRoot: string, target: string): void {
  const normalizedRoot = normalizeFolderPath(allowedRoot)
  const normalizedTarget = normalizeFolderPath(target)
  if (!normalizedTarget.startsWith(`${normalizedRoot}/`) && normalizedTarget !== normalizedRoot) {
    return
  }
  if (!existsSync(target)) return
  for (const entry of readdirSync(target)) {
    const entryPath = join(target, entry)
    if (statSync(entryPath).isDirectory()) {
      rmRecursiveIfInside(allowedRoot, entryPath)
    } else {
      unlinkSync(entryPath)
    }
  }
  rmdirSync(target)
}

/** Remove mistaken nested ~/ToolmanData/... mirrors under a knowledge root. */
export function cleanupNestedToolmanDocumentsMirror(root: string): number {
  const nestedRoot = join(root, 'ToolmanData')
  if (!existsSync(nestedRoot)) return 0

  const userName = getToolmanUserFolderName()
  const nestedUserKnowledge = join(nestedRoot, userName, '本地知识库', DEFAULT_FOLDER_KB_NAME)
  const defaultFolder = join(root, DEFAULT_FOLDER_KB_NAME)
  mkdirSync(defaultFolder, { recursive: true })
  if (existsSync(nestedUserKnowledge)) {
    mergeFolderContents(nestedUserKnowledge, defaultFolder)
  }

  try {
    rmRecursiveIfInside(root, nestedRoot)
  } catch {
    // ignore cleanup failure
  }

  return 1
}
