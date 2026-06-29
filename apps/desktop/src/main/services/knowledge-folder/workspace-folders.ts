import { existsSync, mkdirSync } from 'node:fs'
import { logStructured } from '../structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import {
  KnowledgeFolderEnsureInputSchema,
  KnowledgeFolderGetInputSchema,
  KnowledgeBaseStorageEnsureInputSchema,
} from '@toolman/shared'
import {
  getDefaultKnowledgeFolderPath,
  getDefaultLocalFilesFolderPath,
  getDefaultNetworkKnowledgeFolderPath,
  getDefaultSharedKnowledgeFolderPath,
  ensureToolmanUserDocumentFolders,
} from '../toolman-user-documents.service'
import { getWorkspace, listWorkspaces, updateWorkspace } from '../workspace.service'
import { syncDocumentsFolderSlugWithAccount } from '../documents-folder-slug.service'
import {
  migrateToolmanUserFolderBetweenSlugs,
  migrateToolmanUserFolderPaths,
  migrateToolmanUserFolderPathsForWorkspace,
} from './migration'
import {
  readWorkspaceSettingString,
  resolveStoredFolderPath,
  WORKSPACE_FOLDER_SETTINGS,
  type WorkspaceFolderSettingKey,
} from './types'

export function applyDocumentsFolderSlugAccountSync(): boolean {
  const sync = syncDocumentsFolderSlugWithAccount()
  if (
    sync.changed &&
    sync.previousSlug &&
    sync.nextSlug &&
    sync.previousSlug !== sync.nextSlug
  ) {
    migrateToolmanUserFolderBetweenSlugs(sync.previousSlug, sync.nextSlug)
  }
  return sync.changed
}

/** Migrate legacy paths, create user folders on disk, and persist workspace folder settings. */
export function bootstrapToolmanUserDocumentLayout(): {
  migratedWorkspaces: number
  userRoot: string
} {
  applyDocumentsFolderSlugAccountSync()

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
