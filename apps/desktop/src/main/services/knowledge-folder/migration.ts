import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { logStructured } from '../structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import { dirname, join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { documentSources, fileRegistry } from '@toolman/db'
import { KnowledgeWatchConfigSchema } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../../db/repos'
import { restartKnowledgeWatchersForKb } from '../knowledge-watcher.service'
import { ensureKnowledgeBaseStorageSource } from '../knowledge-kb-storage-source.service'
import { resolveKnowledgeBaseStoragePath } from '../knowledge-kb-storage-path.service'
import {
  getAlternateToolmanDocumentsRoot,
  getToolmanDocumentsRootPath,
  getToolmanUserFolderName,
  isAlternateToolmanDocumentsPath,
  isNonMigratableFolderPath,
  isPathUnderToolmanDocumentsRoot,
  isStoredPathUnderDifferentUserFolder,
  isUserScopedToolmanPath,
  listFlatToolmanPathCandidates,
  normalizeFolderPath,
  resolveFlatToolmanSubfolder,
  shouldMigrateDocumentsWorkspaceFolder,
} from '../toolman-user-documents.service'
import { getWorkspace, listWorkspaces, updateWorkspace } from '../workspace.service'
import { readWorkspaceSettingString, resolveStoredFolderPath, WORKSPACE_FOLDER_SETTINGS, type WorkspaceFolderSettingKey } from './types'

export function replaceFolderPathPrefix(path: string, oldPrefix: string, newPrefix: string): string | null {
  const normalizedPath = normalizeFolderPath(path)
  const normalizedOld = normalizeFolderPath(oldPrefix)
  const normalizedNew = normalizeFolderPath(newPrefix)

  if (normalizedPath === normalizedOld) {
    return normalizedNew
  }
  const oldWithSep = `${normalizedOld}/`
  if (normalizedPath.startsWith(oldWithSep)) {
    return `${normalizedNew}/${normalizedPath.slice(oldWithSep.length)}`
  }
  return null
}

function rewriteKnowledgeWatchConfigPaths(
  watchConfigJson: string,
  oldPrefix: string,
  newPrefix: string,
): string | null {
  try {
    const parsed = KnowledgeWatchConfigSchema.parse(JSON.parse(watchConfigJson))
    let changed = false
    const paths = parsed.paths?.map((path) => {
      const next = replaceFolderPathPrefix(path, oldPrefix, newPrefix)
      if (next && next !== path) {
        changed = true
        return next
      }
      return path
    })
    if (!changed) return null
    return JSON.stringify({ ...parsed, paths })
  } catch {
    return null
  }
}

export function migrateKnowledgePathReferences(
  workspaceId: string,
  oldPrefix: string,
  newPrefix: string,
): void {
  const db = getDatabase()
  const docRepo = getDocumentRepository()
  const kbRepo = getKnowledgeBaseRepository()

  for (const kb of kbRepo.listByWorkspace(workspaceId)) {
    const nextWatchConfigJson = rewriteKnowledgeWatchConfigPaths(
      kb.watchConfigJson,
      oldPrefix,
      newPrefix,
    )
    if (nextWatchConfigJson) {
      kbRepo.update({
        id: kb.id,
        workspaceId,
        watchConfigJson: nextWatchConfigJson,
      })
    }

    for (const source of docRepo.listSourcesByKb(kb.id)) {
      const nextUri = replaceFolderPathPrefix(source.uri, oldPrefix, newPrefix)
      if (!nextUri || nextUri === source.uri) continue
      db.update(documentSources)
        .set({ uri: nextUri, updatedAt: new Date() })
        .where(and(eq(documentSources.id, source.id), eq(documentSources.kbId, kb.id)))
        .run()
    }

    for (const doc of docRepo.listByKb(kb.id)) {
      if (!doc.absolutePath) continue
      const nextPath = replaceFolderPathPrefix(doc.absolutePath, oldPrefix, newPrefix)
      if (!nextPath || nextPath === doc.absolutePath) continue
      docRepo.update(doc.id, kb.id, { absolutePath: nextPath })
    }

    const updatedKb = kbRepo.findRowById(kb.id, workspaceId)
    if (updatedKb) {
      const storagePath = resolveKnowledgeBaseStoragePath(updatedKb, { ensure: true })
      if (storagePath) {
        ensureKnowledgeBaseStorageSource(workspaceId, kb.id, storagePath)
        restartKnowledgeWatchersForKb(workspaceId, kb.id)
      }
    }
  }

  const registryRows = db
    .select()
    .from(fileRegistry)
    .where(eq(fileRegistry.workspaceId, workspaceId))
    .all()

  for (const row of registryRows) {
    const nextPath = replaceFolderPathPrefix(row.absolutePath, oldPrefix, newPrefix)
    if (!nextPath || nextPath === row.absolutePath) continue
    db.update(fileRegistry)
      .set({ absolutePath: nextPath, updatedAt: new Date() })
      .where(eq(fileRegistry.id, row.id))
      .run()
  }
}

export function moveFolderIfNeeded(oldPath: string, newPath: string): void {
  if (normalizeFolderPath(oldPath) === normalizeFolderPath(newPath)) return
  if (isNonMigratableFolderPath(oldPath)) {
    if (!existsSync(newPath)) {
      mkdirSync(newPath, { recursive: true })
    }
    return
  }
  if (!existsSync(oldPath)) {
    if (!existsSync(newPath)) {
      mkdirSync(newPath, { recursive: true })
    }
    return
  }
  if (!existsSync(newPath)) {
    mkdirSync(dirname(newPath), { recursive: true })
    try {
      renameSync(oldPath, newPath)
    } catch (error) {
      const message = toErrorMessage(error, String(error))
      logStructured('knowledge', 'error', `failed to rename folder ${oldPath} -> ${newPath}: ${message}`)
      throw error
    }
  }
}

export function renameKnowledgeStorageFolder(
  workspaceId: string,
  oldPath: string,
  newPath: string,
): void {
  if (normalizeFolderPath(oldPath) === normalizeFolderPath(newPath)) return
  moveFolderIfNeeded(oldPath, newPath)
  migrateKnowledgePathReferences(workspaceId, oldPath, newPath)
}

function shouldMigrateResolvedFolderPath(
  key: WorkspaceFolderSettingKey,
  subfolder: string,
  resolvedPath: string,
): boolean {
  if (isStoredPathUnderDifferentUserFolder(resolvedPath, getToolmanUserFolderName())) {
    return true
  }
  if (isUserScopedToolmanPath(resolvedPath)) return false
  if (isAlternateToolmanDocumentsPath(resolvedPath)) return true
  if (isPathUnderToolmanDocumentsRoot(resolvedPath, getAlternateToolmanDocumentsRoot())) {
    return true
  }
  if (key === 'folderPath' && shouldMigrateDocumentsWorkspaceFolder(resolvedPath)) {
    return true
  }
  const flatSubfolder = resolveFlatToolmanSubfolder(resolvedPath)
  if (flatSubfolder === subfolder) return true
  return listFlatToolmanPathCandidates(subfolder).some(
    (candidate) => normalizeFolderPath(candidate) === normalizeFolderPath(resolvedPath),
  )
}

function migrateWorkspaceFolderSetting(
  workspaceId: string,
  settings: Record<string, unknown>,
  spec: (typeof WORKSPACE_FOLDER_SETTINGS)[number],
): boolean {
  const stored = readWorkspaceSettingString(settings, spec.key)
  const resolvedPath = resolveStoredFolderPath(stored, spec.defaultPath)
  if (!shouldMigrateResolvedFolderPath(spec.key, spec.subfolder, resolvedPath)) {
    return false
  }

  const newPath = spec.defaultPath()
  moveFolderIfNeeded(resolvedPath, newPath)
  updateWorkspace({
    id: workspaceId,
    settings: { [spec.key]: newPath },
  })
  if (!isNonMigratableFolderPath(resolvedPath)) {
    migrateKnowledgePathReferences(workspaceId, resolvedPath, newPath)
  }
  return true
}

export function migrateToolmanUserFolderPathsForWorkspace(workspaceId: string): boolean {
  let migrated = false
  for (const spec of WORKSPACE_FOLDER_SETTINGS) {
    const workspace = getWorkspace({ id: workspaceId })
    if (!workspace) return migrated
    if (migrateWorkspaceFolderSetting(workspaceId, workspace.settings, spec)) {
      migrated = true
    }
  }
  return migrated
}

export function migrateToolmanUserFolderPaths(): number {
  let migrated = 0
  for (const workspace of listWorkspaces()) {
    if (migrateToolmanUserFolderPathsForWorkspace(workspace.id)) {
      migrated += 1
    }
  }
  return migrated
}

/** Move workspace folder settings and on-disk tree when the user folder slug changes. */
export function migrateToolmanUserFolderBetweenSlugs(
  previousSlug: string,
  nextSlug: string,
): number {
  if (!previousSlug.trim() || !nextSlug.trim() || previousSlug === nextSlug) {
    return 0
  }

  const oldRoot = join(getToolmanDocumentsRootPath(), previousSlug)
  const newRoot = join(getToolmanDocumentsRootPath(), nextSlug)
  moveFolderIfNeeded(oldRoot, newRoot)

  let migratedWorkspaces = 0
  for (const workspace of listWorkspaces()) {
    const settings = getWorkspace({ id: workspace.id })?.settings ?? {}
    let workspaceMigrated = false

    for (const spec of WORKSPACE_FOLDER_SETTINGS) {
      const stored = readWorkspaceSettingString(settings, spec.key)
      if (!stored?.trim()) continue

      const resolvedPath = resolveStoredFolderPath(stored, spec.defaultPath)
      const rewritten = replaceFolderPathPrefix(resolvedPath, oldRoot, newRoot)
      if (!rewritten || rewritten === resolvedPath) continue

      moveFolderIfNeeded(resolvedPath, rewritten)
      updateWorkspace({
        id: workspace.id,
        settings: { [spec.key]: rewritten },
      })
      if (!isNonMigratableFolderPath(resolvedPath)) {
        migrateKnowledgePathReferences(workspace.id, resolvedPath, rewritten)
      }
      workspaceMigrated = true
    }

    if (workspaceMigrated) {
      migratedWorkspaces += 1
    }
  }

  return migratedWorkspaces
}
