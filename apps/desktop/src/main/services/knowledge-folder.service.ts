import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { logStructured } from './structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import {KnowledgeFolderEnsureInputSchema,
  KnowledgeFolderGetInputSchema,
  KnowledgeBaseStorageEnsureInputSchema } from '@toolman/shared'
import { getWorkspace, listWorkspaces, updateWorkspace } from './workspace.service'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../db/repos'
import { getDatabase } from '../bootstrap/database'
import { documentSources, fileRegistry } from '@toolman/db'
import { eq, and } from 'drizzle-orm'
import { KnowledgeWatchConfigSchema } from '@toolman/shared'
import { restartKnowledgeWatchersForKb } from './knowledge-watcher.service'
import { ensureKnowledgeBaseStorageSource } from './knowledge-kb-storage-source.service'
import { resolveKnowledgeBaseStoragePath } from './knowledge-kb-storage-path.service'
import {
  getDefaultKnowledgeFolderPath,
  getDefaultLocalFilesFolderPath,
  getDefaultNetworkKnowledgeFolderPath,
  getDefaultSharedKnowledgeFolderPath,
  getDefaultWorkspaceFolderPath,
  ensureToolmanUserDocumentFolders,
  getAlternateToolmanDocumentsRoot,
  isNonMigratableFolderPath,
  isAlternateToolmanDocumentsPath,
  isUserScopedToolmanPath,
  isPathUnderToolmanDocumentsRoot,
  listFlatToolmanPathCandidates,
  normalizeFolderPath,
  resolveFlatToolmanSubfolder,
  shouldMigrateDocumentsWorkspaceFolder,
} from './toolman-user-documents.service'

export {
  getDefaultKnowledgeFolderPath,
  getDefaultLocalFilesFolderPath,
  getDefaultNetworkKnowledgeFolderPath,
  getDefaultSharedKnowledgeFolderPath,
  getDefaultWorkspaceFolderPath,
  getFlatDefaultKnowledgeFolderPath,
  getLegacyDefaultKnowledgeFolderPath,
  getToolmanDocumentsRootPath,
  getToolmanUserFolderName,
  getToolmanUserRootPath,
  ensureToolmanUserDocumentFolders,
  TOOLMAN_USER_DOCUMENT_SUBFOLDERS,
} from './toolman-user-documents.service'

type WorkspaceFolderSettingKey =
  | 'folderPath'
  | 'knowledgeFolderPath'
  | 'networkKnowledgeFolderPath'
  | 'sharedKnowledgeFolderPath'
  | 'localFilesFolderPath'

const WORKSPACE_FOLDER_SETTINGS: Array<{
  key: WorkspaceFolderSettingKey
  subfolder: string
  defaultPath: () => string
}> = [
  { key: 'folderPath', subfolder: '工作区', defaultPath: getDefaultWorkspaceFolderPath },
  { key: 'knowledgeFolderPath', subfolder: '本地知识库', defaultPath: getDefaultKnowledgeFolderPath },
  {
    key: 'networkKnowledgeFolderPath',
    subfolder: '网络知识库',
    defaultPath: getDefaultNetworkKnowledgeFolderPath,
  },
  {
    key: 'sharedKnowledgeFolderPath',
    subfolder: '共享知识库',
    defaultPath: getDefaultSharedKnowledgeFolderPath,
  },
  { key: 'localFilesFolderPath', subfolder: '本地文件', defaultPath: getDefaultLocalFilesFolderPath },
]

function readWorkspaceSettingString(
  settings: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = settings[key]
  return typeof value === 'string' ? value : undefined
}

function expandHomePrefix(path: string): string {
  const trimmed = path.trim()
  if (trimmed === '~') return homedir()
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return join(homedir(), trimmed.slice(2))
  }
  return trimmed
}

/** Resolve user-configured folder paths to absolute paths under the home directory. */
export function resolveStoredFolderPath(
  stored: string | undefined,
  defaultPath: () => string,
): string {
  const raw =
    typeof stored === 'string' && stored.trim().length > 0
      ? expandHomePrefix(stored)
      : defaultPath()
  if (!isAbsolute(raw)) {
    return resolve(homedir(), raw)
  }
  return resolve(raw)
}

function replaceFolderPathPrefix(path: string, oldPrefix: string, newPrefix: string): string | null {
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

function migrateKnowledgePathReferences(
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

export function renameKnowledgeStorageFolder(
  workspaceId: string,
  oldPath: string,
  newPath: string,
): void {
  if (normalizeFolderPath(oldPath) === normalizeFolderPath(newPath)) return
  moveFolderIfNeeded(oldPath, newPath)
  migrateKnowledgePathReferences(workspaceId, oldPath, newPath)
}

function moveFolderIfNeeded(oldPath: string, newPath: string): void {
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

function shouldMigrateResolvedFolderPath(
  key: WorkspaceFolderSettingKey,
  subfolder: string,
  resolvedPath: string,
): boolean {
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

/** Migrate legacy paths, create user folders on disk, and persist workspace folder settings. */
export function bootstrapToolmanUserDocumentLayout(): {
  migratedWorkspaces: number
  userRoot: string
} {
  const userRoot = ensureToolmanUserDocumentFolders()
  const migratedWorkspaces = migrateToolmanUserFolderPaths()

  for (const workspace of listWorkspaces()) {
    for (const spec of WORKSPACE_FOLDER_SETTINGS) {
      try {
        ensureWorkspaceFolderSetting(workspace.id, spec.key, spec.defaultPath)
      } catch (error) {
        const message = toErrorMessage(error, String(error))
        logStructured('knowledge', 'warn', `failed to bootstrap folder ${spec.key} for workspace ${workspace.id}: ${message}`)
      }
    }
  }

  return { migratedWorkspaces, userRoot }
}

/** @deprecated Use migrateToolmanUserFolderPathsForWorkspace */
export function migrateLegacyKnowledgeFolderPathForWorkspace(workspaceId: string): boolean {
  return migrateToolmanUserFolderPathsForWorkspace(workspaceId)
}

/** @deprecated Use migrateToolmanUserFolderPaths */
export function migrateLegacyKnowledgeFolderPaths(): number {
  return migrateToolmanUserFolderPaths()
}

function ensureWorkspaceFolderSetting(
  workspaceId: string,
  key: WorkspaceFolderSettingKey,
  defaultPath: () => string,
): string {
  migrateToolmanUserFolderPathsForWorkspace(workspaceId)

  const workspace = getWorkspace({ id: workspaceId })
  if (!workspace) {
    throw new Error('工作区不存在')
  }

  const folderPath = resolveStoredFolderPath(
    readWorkspaceSettingString(workspace.settings, key),
    defaultPath,
  )

  if (!existsSync(folderPath)) {
    mkdirSync(folderPath, { recursive: true })
  }

  if (readWorkspaceSettingString(workspace.settings, key) !== folderPath) {
    updateWorkspace({
      id: workspaceId,
      settings: { [key]: folderPath },
    })
  }

  return folderPath
}

export function ensureWorkspaceKnowledgeFolder(input: unknown): string {
  const data = KnowledgeFolderEnsureInputSchema.parse(input)
  return ensureWorkspaceFolderSetting(
    data.workspaceId,
    'knowledgeFolderPath',
    getDefaultKnowledgeFolderPath,
  )
}

export function getWorkspaceKnowledgeFolderPath(input: unknown): string | null {
  const data = KnowledgeFolderGetInputSchema.parse(input)
  const workspace = getWorkspace({ id: data.workspaceId })
  if (!workspace) return null

  const stored = readWorkspaceSettingString(workspace.settings, 'knowledgeFolderPath')
  if (typeof stored === 'string' && stored.trim().length > 0) {
    return resolveStoredFolderPath(stored, getDefaultKnowledgeFolderPath)
  }

  return null
}

export function ensureWorkspaceNetworkKnowledgeFolder(input: unknown): string {
  const data = KnowledgeFolderEnsureInputSchema.parse(input)
  return ensureWorkspaceFolderSetting(
    data.workspaceId,
    'networkKnowledgeFolderPath',
    getDefaultNetworkKnowledgeFolderPath,
  )
}

export function getWorkspaceNetworkKnowledgeFolderPath(input: unknown): string | null {
  const data = KnowledgeFolderGetInputSchema.parse(input)
  const workspace = getWorkspace({ id: data.workspaceId })
  if (!workspace) return null

  const stored = readWorkspaceSettingString(workspace.settings, 'networkKnowledgeFolderPath')
  if (typeof stored === 'string' && stored.trim().length > 0) {
    return resolveStoredFolderPath(stored, getDefaultNetworkKnowledgeFolderPath)
  }

  return null
}

export function ensureWorkspaceSharedKnowledgeFolder(input: unknown): string {
  const data = KnowledgeFolderEnsureInputSchema.parse(input)
  return ensureWorkspaceFolderSetting(
    data.workspaceId,
    'sharedKnowledgeFolderPath',
    getDefaultSharedKnowledgeFolderPath,
  )
}

export function getWorkspaceSharedKnowledgeFolderPath(input: unknown): string | null {
  const data = KnowledgeFolderGetInputSchema.parse(input)
  const workspace = getWorkspace({ id: data.workspaceId })
  if (!workspace) return null

  const stored = readWorkspaceSettingString(workspace.settings, 'sharedKnowledgeFolderPath')
  if (typeof stored === 'string' && stored.trim().length > 0) {
    return resolveStoredFolderPath(stored, getDefaultSharedKnowledgeFolderPath)
  }

  return null
}

export function ensureWorkspaceLocalFilesFolder(input: unknown): string {
  const data = KnowledgeFolderEnsureInputSchema.parse(input)
  return ensureWorkspaceFolderSetting(
    data.workspaceId,
    'localFilesFolderPath',
    getDefaultLocalFilesFolderPath,
  )
}

export function getWorkspaceLocalFilesFolderPath(input: unknown): string | null {
  const data = KnowledgeFolderGetInputSchema.parse(input)
  const workspace = getWorkspace({ id: data.workspaceId })
  if (!workspace) return null

  const stored = workspace.settings.localFilesFolderPath
  if (typeof stored === 'string' && stored.trim().length > 0) {
    return resolveStoredFolderPath(stored, getDefaultLocalFilesFolderPath)
  }

  return null
}

export function ensureKnowledgeBaseStoragePath(input: unknown): string {
  const data = KnowledgeBaseStorageEnsureInputSchema.parse(input)
  const folderPath = resolveStoredFolderPath(data.path, () => data.path.trim())
  if (!existsSync(folderPath)) {
    mkdirSync(folderPath, { recursive: true })
  }
  return folderPath
}
