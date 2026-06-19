import {
  KnowledgeDefaultFolderEnsureKbInputSchema,
  KnowledgeDefaultFolderEnsureKbOutputSchema,
} from '@toolman/shared'
import {
  createKnowledgeBase,
  listKnowledgeBases,
} from './knowledge.service'
import {
  ensureWorkspaceKnowledgeFolder,
  ensureWorkspaceLocalFilesFolder,
  ensureWorkspaceNetworkKnowledgeFolder,
} from './knowledge-folder.service'
import { ensureKnowledgeBaseStorageSource } from './knowledge-kb-storage-source.service'
import { resolveKnowledgeBaseStoragePath } from './knowledge-kb-storage-path.service'
import { restartKnowledgeWatchersForKb } from './knowledge-watcher.service'

const DEFAULT_FOLDER_KB_NAMES = {
  local: '默认文件夹',
  network: '默认网络文件夹',
  local_files: '默认本地文件',
} as const

const SYSTEM_KB_NAMES = new Set(Object.values(DEFAULT_FOLDER_KB_NAMES))

export function isSystemKnowledgeBase(kb: { name: string }): boolean {
  return SYSTEM_KB_NAMES.has(kb.name as (typeof DEFAULT_FOLDER_KB_NAMES)[keyof typeof DEFAULT_FOLDER_KB_NAMES])
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

  const items = listKnowledgeBases({ workspaceId: data.workspaceId })
  const existing =
    items.find((item) => item.name === name && item.kind === data.kind) ??
    items.find((item) => item.name === name)
  const kb = existing ?? createKnowledgeBase({
    workspaceId: data.workspaceId,
    name,
    description:
      data.kind === 'network'
        ? '默认网络文件夹知识库'
        : data.kind === 'local_files'
          ? '默认本地文件存储'
          : '默认文件夹知识库',
    kind: data.kind,
  })

  const storagePath = resolveKnowledgeBaseStoragePath(
    { workspaceId: data.workspaceId, name: kb.name, kind: kb.kind },
    { ensure: true },
  )
  if (storagePath) {
    ensureKnowledgeBaseStorageSource(data.workspaceId, kb.id, storagePath)
    restartKnowledgeWatchersForKb(data.workspaceId, kb.id)
  }

  return KnowledgeDefaultFolderEnsureKbOutputSchema.parse({ kb, folderPath })
}
