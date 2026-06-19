import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import {
  KnowledgeFolderEnsureInputSchema,
  KnowledgeFolderGetInputSchema,
  KnowledgeBaseStorageEnsureInputSchema,
} from '@toolman/shared'
import { getWorkspace, updateWorkspace } from './workspace.service'

export function getDefaultKnowledgeFolderPath(): string {
  return join(app.getPath('documents'), 'Toolman', '知识库')
}

export function getDefaultNetworkKnowledgeFolderPath(): string {
  return join(app.getPath('documents'), 'Toolman', '网络知识库')
}

export function getDefaultLocalFilesFolderPath(): string {
  return join(app.getPath('documents'), 'Toolman', '本地文件')
}

export function ensureWorkspaceKnowledgeFolder(input: unknown): string {
  const data = KnowledgeFolderEnsureInputSchema.parse(input)
  const workspace = getWorkspace({ id: data.workspaceId })
  if (!workspace) {
    throw new Error('工作区不存在')
  }

  const stored = workspace.settings.knowledgeFolderPath
  let folderPath =
    typeof stored === 'string' && stored.trim().length > 0
      ? stored.trim()
      : getDefaultKnowledgeFolderPath()

  if (!existsSync(folderPath)) {
    mkdirSync(folderPath, { recursive: true })
  }

  if (workspace.settings.knowledgeFolderPath !== folderPath) {
    updateWorkspace({
      id: data.workspaceId,
      settings: { knowledgeFolderPath: folderPath },
    })
  }

  return folderPath
}

export function getWorkspaceKnowledgeFolderPath(input: unknown): string | null {
  const data = KnowledgeFolderGetInputSchema.parse(input)
  const workspace = getWorkspace({ id: data.workspaceId })
  if (!workspace) return null

  const stored = workspace.settings.knowledgeFolderPath
  if (typeof stored === 'string' && stored.trim().length > 0) {
    return stored.trim()
  }

  return null
}

export function ensureWorkspaceNetworkKnowledgeFolder(input: unknown): string {
  const data = KnowledgeFolderEnsureInputSchema.parse(input)
  const workspace = getWorkspace({ id: data.workspaceId })
  if (!workspace) {
    throw new Error('工作区不存在')
  }

  const stored = workspace.settings.networkKnowledgeFolderPath
  let folderPath =
    typeof stored === 'string' && stored.trim().length > 0
      ? stored.trim()
      : getDefaultNetworkKnowledgeFolderPath()

  if (!existsSync(folderPath)) {
    mkdirSync(folderPath, { recursive: true })
  }

  if (workspace.settings.networkKnowledgeFolderPath !== folderPath) {
    updateWorkspace({
      id: data.workspaceId,
      settings: { networkKnowledgeFolderPath: folderPath },
    })
  }

  return folderPath
}

export function getWorkspaceNetworkKnowledgeFolderPath(input: unknown): string | null {
  const data = KnowledgeFolderGetInputSchema.parse(input)
  const workspace = getWorkspace({ id: data.workspaceId })
  if (!workspace) return null

  const stored = workspace.settings.networkKnowledgeFolderPath
  if (typeof stored === 'string' && stored.trim().length > 0) {
    return stored.trim()
  }

  return null
}

export function ensureWorkspaceLocalFilesFolder(input: unknown): string {
  const data = KnowledgeFolderEnsureInputSchema.parse(input)
  const workspace = getWorkspace({ id: data.workspaceId })
  if (!workspace) {
    throw new Error('工作区不存在')
  }

  const stored = workspace.settings.localFilesFolderPath
  let folderPath =
    typeof stored === 'string' && stored.trim().length > 0
      ? stored.trim()
      : getDefaultLocalFilesFolderPath()

  if (!existsSync(folderPath)) {
    mkdirSync(folderPath, { recursive: true })
  }

  if (workspace.settings.localFilesFolderPath !== folderPath) {
    updateWorkspace({
      id: data.workspaceId,
      settings: { localFilesFolderPath: folderPath },
    })
  }

  return folderPath
}

export function getWorkspaceLocalFilesFolderPath(input: unknown): string | null {
  const data = KnowledgeFolderGetInputSchema.parse(input)
  const workspace = getWorkspace({ id: data.workspaceId })
  if (!workspace) return null

  const stored = workspace.settings.localFilesFolderPath
  if (typeof stored === 'string' && stored.trim().length > 0) {
    return stored.trim()
  }

  return null
}

export function ensureKnowledgeBaseStoragePath(input: unknown): string {
  const data = KnowledgeBaseStorageEnsureInputSchema.parse(input)
  const folderPath = data.path.trim()
  if (!existsSync(folderPath)) {
    mkdirSync(folderPath, { recursive: true })
  }
  return folderPath
}
