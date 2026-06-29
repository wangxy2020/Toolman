import { logStructured } from '../structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import { join } from 'node:path'
import { KnowledgeDefaultFolderEnsureKbInputSchema,
  KnowledgeDefaultFolderEnsureKbOutputSchema } from '@toolman/shared'
import {
  createKnowledgeBase,
  listKnowledgeBases,
} from '../knowledge.service'
import {
  ensureWorkspaceKnowledgeFolder,
  ensureWorkspaceLocalFilesFolder,
  ensureWorkspaceNetworkKnowledgeFolder,
  getWorkspaceKnowledgeFolderPath,
  getWorkspaceLocalFilesFolderPath,
  getWorkspaceNetworkKnowledgeFolderPath,
} from '../knowledge-folder.service'
import { listWorkspaces } from '../workspace.service'
import { ensureKnowledgeBaseStorageSource } from '../knowledge-kb-storage-source.service'
import { resolveKnowledgeBaseStoragePath } from '../knowledge-kb-storage-path.service'
import { restartKnowledgeWatchersForKb } from '../knowledge-watcher.service'
import { getKnowledgeBaseRepository } from '../../db/repos'
import {
  DEFAULT_FOLDER_KB_NAMES,
  DEFAULT_FOLDER_KINDS,
  LEGACY_DEFAULT_FOLDER_KB_NAMES,
  isSystemKnowledgeBase,
} from './constants'
import {
  cleanupNestedToolmanDocumentsMirror,
  migrateSystemKnowledgeBaseStorageLayout,
  purgeLegacyDefaultDiskFoldersForKind,
  removeLegacyKnowledgeBaseRows,
} from './legacy'

function resolveDefaultFolderKnowledgeBase(
  workspaceId: string,
  kind: keyof typeof DEFAULT_FOLDER_KB_NAMES,
) {
  const name = DEFAULT_FOLDER_KB_NAMES[kind]
  const legacyName = kind === 'local' ? null : LEGACY_DEFAULT_FOLDER_KB_NAMES[kind]
  const items = listKnowledgeBases({ workspaceId })
  const kbRepo = getKnowledgeBaseRepository()

  let existing =
    items.find((item) => item.name === name && item.kind === kind) ??
    (legacyName
      ? items.find((item) => item.name === legacyName && item.kind === kind)
      : null)

  if (existing && existing.name !== name) {
    kbRepo.update({
      id: existing.id,
      workspaceId,
      name,
    })
    existing = { ...existing, name }
  }

  if (existing && existing.kind !== kind) {
    return null
  }

  return existing
}

export function cleanupErroneousKnowledgeDiskPaths(): number {
  let cleaned = 0
  for (const workspace of listWorkspaces()) {
    const roots: Array<{ root: string | null; kind: keyof typeof DEFAULT_FOLDER_KB_NAMES }> = [
      { root: getWorkspaceKnowledgeFolderPath({ workspaceId: workspace.id }), kind: 'local' },
      { root: getWorkspaceNetworkKnowledgeFolderPath({ workspaceId: workspace.id }), kind: 'network' },
      { root: getWorkspaceLocalFilesFolderPath({ workspaceId: workspace.id }), kind: 'local_files' },
    ]
    for (const { root, kind } of roots) {
      if (!root) continue
      cleaned += cleanupNestedToolmanDocumentsMirror(root)
      purgeLegacyDefaultDiskFoldersForKind(workspace.id, root, kind)
      removeLegacyKnowledgeBaseRows(workspace.id, kind)
      cleaned += 1
    }
  }
  return cleaned
}

export function ensureDefaultFolderKnowledgeBase(input: unknown) {
  const data = KnowledgeDefaultFolderEnsureKbInputSchema.parse(input)
  const name = DEFAULT_FOLDER_KB_NAMES[data.kind]
  const folderPath =
    data.kind === 'network'
      ? ensureWorkspaceNetworkKnowledgeFolder({ workspaceId: data.workspaceId })
      : data.kind === 'local_files'
        ? ensureWorkspaceLocalFilesFolder({ workspaceId: data.workspaceId })
        : ensureWorkspaceKnowledgeFolder({ workspaceId: data.workspaceId })

  const existing = resolveDefaultFolderKnowledgeBase(data.workspaceId, data.kind)
  const kb =
    existing ??
    createKnowledgeBase({
      workspaceId: data.workspaceId,
      name,
      description: '默认文件夹知识库',
      kind: data.kind,
    })

  purgeLegacyDefaultDiskFoldersForKind(data.workspaceId, folderPath, data.kind)
  removeLegacyKnowledgeBaseRows(data.workspaceId, data.kind)

  migrateSystemKnowledgeBaseStorageLayout(data.workspaceId, kb.id, folderPath, name)

  const storagePath = resolveKnowledgeBaseStoragePath(
    { workspaceId: data.workspaceId, name: kb.name, kind: kb.kind, description: kb.description },
    { ensure: true },
  )
  if (storagePath) {
    ensureKnowledgeBaseStorageSource(data.workspaceId, kb.id, storagePath)
    restartKnowledgeWatchersForKb(data.workspaceId, kb.id)
  }

  return KnowledgeDefaultFolderEnsureKbOutputSchema.parse({
    kb,
    folderPath: storagePath ?? join(folderPath, name),
  })
}

export function migrateAllDefaultFolderKnowledgeBases(): {
  workspaceCount: number
  migratedKinds: number
} {
  let workspaceCount = 0
  let migratedKinds = 0

  for (const workspace of listWorkspaces()) {
    workspaceCount += 1
    for (const kind of DEFAULT_FOLDER_KINDS) {
      try {
        ensureDefaultFolderKnowledgeBase({ workspaceId: workspace.id, kind })
        migratedKinds += 1
      } catch (error) {
        const message = toErrorMessage(error, String(error))
        logStructured('knowledge', 'warn', `default folder migration failed for workspace ${workspace.id} (${kind}): ${message}`)
      }
    }
  }

  cleanupErroneousKnowledgeDiskPaths()
  return { workspaceCount, migratedKinds }
}

export { isSystemKnowledgeBase }
