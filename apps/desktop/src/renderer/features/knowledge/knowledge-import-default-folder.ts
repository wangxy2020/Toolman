import { IpcChannel, type KnowledgeBase, type KnowledgeFolderKind } from '@toolman/shared'
import {
  LEGACY_SYSTEM_DEFAULT_LOCAL_FILES_KB_NAME,
  LEGACY_SYSTEM_DEFAULT_NETWORK_FOLDER_KB_NAME,
  SYSTEM_DEFAULT_FOLDER_KB_NAME,
} from './knowledge-sidebar-types'

export type DefaultFolderKnowledgeKind = Exclude<KnowledgeFolderKind, 'shared'>

const DEFAULT_FOLDER_KB_NAMES: Record<DefaultFolderKnowledgeKind, string> = {
  local: SYSTEM_DEFAULT_FOLDER_KB_NAME,
  network: SYSTEM_DEFAULT_FOLDER_KB_NAME,
  local_files: SYSTEM_DEFAULT_FOLDER_KB_NAME,
}

const ENSURE_FOLDER_CHANNELS: Record<DefaultFolderKnowledgeKind, IpcChannel> = {
  local: IpcChannel.KnowledgeFolderEnsure,
  network: IpcChannel.KnowledgeNetworkFolderEnsure,
  local_files: IpcChannel.KnowledgeLocalFilesFolderEnsure,
}

async function invokeIpc<T>(channel: IpcChannel, input: unknown): Promise<T | null> {
  try {
    const result = await window.api.invoke(channel, input)
    if (!result.ok) return null
    return result.data as T
  } catch {
    return null
  }
}

async function ensureDefaultFolderPath(
  workspaceId: string,
  kind: DefaultFolderKnowledgeKind,
): Promise<string | null> {
  const data = await invokeIpc<{ path: string }>(ENSURE_FOLDER_CHANNELS[kind], { workspaceId })
  return data?.path ?? null
}

async function findOrCreateDefaultFolderKb(
  workspaceId: string,
  kind: DefaultFolderKnowledgeKind,
): Promise<KnowledgeBase | null> {
  const listData = await invokeIpc<{ items: KnowledgeBase[] }>(IpcChannel.KnowledgeBaseList, {
    workspaceId,
  })
  if (!listData) return null

  const name = DEFAULT_FOLDER_KB_NAMES[kind]
  const legacyName =
    kind === 'network'
      ? LEGACY_SYSTEM_DEFAULT_NETWORK_FOLDER_KB_NAME
      : kind === 'local_files'
        ? LEGACY_SYSTEM_DEFAULT_LOCAL_FILES_KB_NAME
        : null
  const existing =
    listData.items.find((item) => item.name === name && item.kind === kind) ??
    (legacyName
      ? listData.items.find((item) => item.name === legacyName && item.kind === kind)
      : null)
  if (existing && existing.kind !== kind) {
    return null
  }
  if (existing) return existing

  const descriptions: Record<DefaultFolderKnowledgeKind, string> = {
    local: '默认文件夹知识库',
    network: '默认文件夹知识库',
    local_files: '默认文件夹存储',
  }

  const created = await invokeIpc<KnowledgeBase>(IpcChannel.KnowledgeBaseCreate, {
    workspaceId,
    name,
    description: descriptions[kind],
    kind,
  })
  return created
}

export async function ensureDefaultFolderKb(
  workspaceId: string,
  kind: DefaultFolderKnowledgeKind,
): Promise<{ kb: KnowledgeBase; folderPath: string } | null> {
  try {
    const data = await invokeIpc<{ kb: KnowledgeBase; folderPath: string }>(
      IpcChannel.KnowledgeDefaultFolderEnsureKb,
      { workspaceId, kind },
    )
    if (data) return data
  } catch {
    // IPC handler may be unavailable until the main process restarts.
  }

  try {
    const folderPath = await ensureDefaultFolderPath(workspaceId, kind)
    if (!folderPath) return null

    const kb = await findOrCreateDefaultFolderKb(workspaceId, kind)
    if (!kb) return null

    return { kb, folderPath }
  } catch {
    return null
  }
}
