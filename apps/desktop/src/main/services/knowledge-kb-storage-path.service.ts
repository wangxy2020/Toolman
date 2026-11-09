import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import type { KnowledgeBaseRow } from '@toolman/db'
import {
  isP2pSharedKnowledgeMirrorDescription,
  parseP2pGroupSavedKnowledgeMeta,
  type KnowledgeFolderKind,
} from '@toolman/shared'
import {
  ensureWorkspaceKnowledgeFolder,
  ensureWorkspaceLocalFilesFolder,
  ensureWorkspaceNetworkKnowledgeFolder,
  ensureWorkspaceSharedKnowledgeFolder,
  ensureWorkspaceSyncKnowledgeFolder,
  getWorkspaceKnowledgeFolderPath,
  getWorkspaceLocalFilesFolderPath,
  getWorkspaceNetworkKnowledgeFolderPath,
  getWorkspaceSharedKnowledgeFolderPath,
  getWorkspaceSyncKnowledgeFolderPath,
} from './knowledge-folder.service'

function sanitizeKnowledgeBaseFolderName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''

  return trimmed
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Relative folder name under 共享知识库 for a saved group copy. */
export function resolveGroupSavedKnowledgeStorageDir(
  meta: Pick<import('@toolman/shared').P2pGroupSavedKnowledgeMeta, 'groupName'>,
): string | null {
  const groupDir = sanitizeKnowledgeBaseFolderName(meta.groupName)
  return groupDir || null
}

function resolveWorkspaceRootFolder(
  workspaceId: string,
  kind: KnowledgeFolderKind,
  ensure: boolean,
): string | null {
  if (kind === 'network') {
    if (ensure) {
      return ensureWorkspaceNetworkKnowledgeFolder({ workspaceId })
    }
    return (
      getWorkspaceNetworkKnowledgeFolderPath({ workspaceId }) ??
      ensureWorkspaceNetworkKnowledgeFolder({ workspaceId })
    )
  }

  if (kind === 'shared') {
    if (ensure) {
      return ensureWorkspaceSharedKnowledgeFolder({ workspaceId })
    }
    return (
      getWorkspaceSharedKnowledgeFolderPath({ workspaceId }) ??
      ensureWorkspaceSharedKnowledgeFolder({ workspaceId })
    )
  }

  if (kind === 'sync') {
    if (ensure) {
      return ensureWorkspaceSyncKnowledgeFolder({ workspaceId })
    }
    return (
      getWorkspaceSyncKnowledgeFolderPath({ workspaceId }) ??
      ensureWorkspaceSyncKnowledgeFolder({ workspaceId })
    )
  }

  if (kind === 'local_files') {
    if (ensure) {
      return ensureWorkspaceLocalFilesFolder({ workspaceId })
    }
    return (
      getWorkspaceLocalFilesFolderPath({ workspaceId }) ??
      ensureWorkspaceLocalFilesFolder({ workspaceId })
    )
  }

  if (ensure) {
    return ensureWorkspaceKnowledgeFolder({ workspaceId })
  }
  return (
    getWorkspaceKnowledgeFolderPath({ workspaceId }) ??
    ensureWorkspaceKnowledgeFolder({ workspaceId })
  )
}

function resolveKnowledgeStorageKind(
  kind: string,
): KnowledgeFolderKind {
  if (kind === 'network') return 'network'
  if (kind === 'shared') return 'shared'
  if (kind === 'sync') return 'sync'
  if (kind === 'local_files') return 'local_files'
  return 'local'
}

export function resolveKnowledgeBaseStoragePath(
  kb: Pick<KnowledgeBaseRow, 'workspaceId' | 'name' | 'kind' | 'description'>,
  options?: { ensure?: boolean },
): string | null {
  const ensure = options?.ensure ?? false
  const kind = resolveKnowledgeStorageKind(kb.kind)
  const baseFolder = resolveWorkspaceRootFolder(kb.workspaceId, kind, ensure)
  if (!baseFolder) return null

  const groupSaved = parseP2pGroupSavedKnowledgeMeta(kb.description)
  if (groupSaved && kind === 'shared') {
    const groupDir = resolveGroupSavedKnowledgeStorageDir(groupSaved)
    if (!groupDir) return null

    const storagePath = join(baseFolder, groupDir)
    if (ensure && !existsSync(storagePath)) {
      mkdirSync(storagePath, { recursive: true })
    }
    return storagePath
  }

  const folderName = sanitizeKnowledgeBaseFolderName(kb.name)
  if (!folderName) return null

  const storagePath = join(baseFolder, folderName)
  if (ensure && !existsSync(storagePath)) {
    mkdirSync(storagePath, { recursive: true })
  }

  return storagePath
}

/** True when storagePath is a real subdirectory of the knowledge kind root (never the root itself). */
export function canRemoveKnowledgeStoragePath(storagePath: string, rootPath: string): boolean {
  const storage = resolve(storagePath)
  const root = resolve(rootPath)
  if (!storage || !root || storage === root) return false
  return storage.startsWith(`${root}${sep}`)
}

/**
 * Delete the managed on-disk folder for a knowledge base after sidebar/DB delete.
 * Covers sync/local/shared/local_files/network folder KBs; skips P2P mirror copies.
 */
export function removeKnowledgeBaseStorageDirectory(
  kb: Pick<KnowledgeBaseRow, 'workspaceId' | 'name' | 'kind' | 'description'>,
): void {
  if (isP2pSharedKnowledgeMirrorDescription(kb.description)) return

  const storagePath = resolveKnowledgeBaseStoragePath(kb, { ensure: false })
  if (!storagePath || !existsSync(storagePath)) return

  const kind = resolveKnowledgeStorageKind(kb.kind)
  const rootPath = resolveWorkspaceRootFolder(kb.workspaceId, kind, false)
  if (!rootPath || !canRemoveKnowledgeStoragePath(storagePath, rootPath)) return

  try {
    rmSync(resolve(storagePath), { recursive: true, force: true })
  } catch {
    // ignore cleanup failure; DB soft-delete still proceeds
  }
}
