import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { KnowledgeBaseRow } from '@toolman/db'
import type { KnowledgeFolderKind } from '@toolman/shared'
import { isSystemKnowledgeBase } from './knowledge-default-folder-kb.service'
import {
  ensureWorkspaceKnowledgeFolder,
  ensureWorkspaceLocalFilesFolder,
  ensureWorkspaceNetworkKnowledgeFolder,
  getWorkspaceKnowledgeFolderPath,
  getWorkspaceLocalFilesFolderPath,
  getWorkspaceNetworkKnowledgeFolderPath,
} from './knowledge-folder.service'

function sanitizeKnowledgeBaseFolderName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''

  return trimmed
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
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
  if (kind === 'local_files') return 'local_files'
  return 'local'
}

export function resolveKnowledgeBaseStoragePath(
  kb: Pick<KnowledgeBaseRow, 'workspaceId' | 'name' | 'kind'>,
  options?: { ensure?: boolean },
): string | null {
  const ensure = options?.ensure ?? false
  const kind = resolveKnowledgeStorageKind(kb.kind)
  const baseFolder = resolveWorkspaceRootFolder(kb.workspaceId, kind, ensure)
  if (!baseFolder) return null

  if (isSystemKnowledgeBase(kb)) {
    return baseFolder
  }

  const folderName = sanitizeKnowledgeBaseFolderName(kb.name)
  if (!folderName) return null

  const storagePath = join(baseFolder, folderName)
  if (ensure && !existsSync(storagePath)) {
    mkdirSync(storagePath, { recursive: true })
  }

  return storagePath
}
