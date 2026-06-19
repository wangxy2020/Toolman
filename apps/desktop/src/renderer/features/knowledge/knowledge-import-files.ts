import { IpcChannel, type KnowledgeBase, type KnowledgeFolderKind } from '@toolman/shared'
import { buildKnowledgeBasePath, getPathBasename } from './knowledge-path-utils'
import {
  DEFAULT_KNOWLEDGE_FOLDER_ID,
  DEFAULT_LOCAL_FILES_FOLDER_ID,
  DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID,
  SYSTEM_DEFAULT_FOLDER_KB_NAME,
  SYSTEM_DEFAULT_LOCAL_FILES_KB_NAME,
  SYSTEM_DEFAULT_NETWORK_FOLDER_KB_NAME,
  type KnowledgeSidebarSection,
} from './knowledge-sidebar-types'

const DEFAULT_FOLDER_KB_NAMES: Record<KnowledgeFolderKind, string> = {
  local: SYSTEM_DEFAULT_FOLDER_KB_NAME,
  network: SYSTEM_DEFAULT_NETWORK_FOLDER_KB_NAME,
  local_files: SYSTEM_DEFAULT_LOCAL_FILES_KB_NAME,
}

const ENSURE_FOLDER_CHANNELS: Record<KnowledgeFolderKind, IpcChannel> = {
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
  kind: KnowledgeFolderKind,
): Promise<string | null> {
  const data = await invokeIpc<{ path: string }>(ENSURE_FOLDER_CHANNELS[kind], { workspaceId })
  return data?.path ?? null
}

async function findOrCreateDefaultFolderKb(
  workspaceId: string,
  kind: KnowledgeFolderKind,
): Promise<KnowledgeBase | null> {
  const listData = await invokeIpc<{ items: KnowledgeBase[] }>(IpcChannel.KnowledgeBaseList, {
    workspaceId,
  })
  if (!listData) return null

  const name = DEFAULT_FOLDER_KB_NAMES[kind]
  const existing =
    listData.items.find((item) => item.name === name && item.kind === kind) ??
    listData.items.find((item) => item.name === name)
  if (existing) return existing

  const descriptions: Record<KnowledgeFolderKind, string> = {
    local: '默认文件夹知识库',
    network: '默认网络文件夹知识库',
    local_files: '默认本地文件存储',
  }

  const created = await invokeIpc<KnowledgeBase>(IpcChannel.KnowledgeBaseCreate, {
    workspaceId,
    name,
    description: descriptions[kind],
    kind,
  })
  return created
}

interface ImportTarget {
  kbId: string | null
  storagePath: string | null
  defaultImportPath: string | null
  ready: boolean
  vectorized: boolean
}

export async function ensureDefaultFolderKb(
  workspaceId: string,
  kind: KnowledgeFolderKind,
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

export function buildStoragePathForKb(
  baseFolder: string | null,
  kbName: string,
): string | null {
  if (!baseFolder) return null
  const path = buildKnowledgeBasePath(baseFolder, kbName)
  return path || null
}

export function buildIngestPaths(storagePath: string, filePaths: string[]): string[] {
  const sep = storagePath.includes('\\') ? '\\' : '/'
  const root = storagePath.replace(/[/\\]+$/, '')
  return filePaths.map((filePath) => `${root}${sep}${getPathBasename(filePath)}`)
}

export async function importFilesToKnowledgeStorage(options: {
  workspaceId: string
  storagePath: string
  filePaths: string[]
  setError: (message: string | null) => void
}): Promise<string[] | null> {
  const { storagePath, filePaths, setError } = options
  if (filePaths.length === 0) return null

  if (!storagePath.trim()) {
    setError('知识库存储路径未就绪，请先在设置中配置存储目录')
    return null
  }

  setError(null)

  const ensureResult = await window.api.invoke(IpcChannel.KnowledgeBaseStorageEnsure, {
    path: storagePath,
  })
  if (!ensureResult.ok) {
    setError(ensureResult.error.message)
    return null
  }

  const importResult = await window.api.invoke(IpcChannel.KnowledgeFolderImportFiles, {
    folderPath: storagePath,
    filePaths,
  })
  if (!importResult.ok) {
    setError(importResult.error.message)
    return null
  }

  const data = importResult.data as {
    imported: number
    skipped: number
    failed: Array<{ path: string; message: string }>
  }

  if (data.failed.length > 0 && data.imported === 0 && data.skipped === 0) {
    const detail = data.failed
      .map((item) => item.message)
      .slice(0, 2)
      .join('；')
    setError(`文件复制失败${detail ? `：${detail}` : ''}`)
    return null
  }

  return buildIngestPaths(storagePath, filePaths)
}

export function resolveKnowledgeImportTarget(options: {
  workspaceId: string | null
  section: KnowledgeSidebarSection
  activeId: string | null
  activeKbId: string | null
  activeKbName: string | null
  activeKbKind: KnowledgeBase['kind'] | null
  defaultFolderKbId: string | null
  defaultNetworkFolderKbId: string | null
  defaultLocalFilesKbId: string | null
  knowledgeFolderPath: string | null
  networkKnowledgeFolderPath: string | null
  localFilesFolderPath: string | null
}): ImportTarget {
  const {
    section,
    activeId,
    activeKbId,
    activeKbName,
    activeKbKind,
    defaultFolderKbId,
    defaultNetworkFolderKbId,
    defaultLocalFilesKbId,
    knowledgeFolderPath,
    networkKnowledgeFolderPath,
    localFilesFolderPath,
  } = options

  const showingDefaultFolder = section === 'local' && activeId === DEFAULT_KNOWLEDGE_FOLDER_ID
  const showingDefaultNetworkFolder =
    section === 'network' && activeId === DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID
  const showingDefaultLocalFilesFolder =
    section === 'local-files' && activeId === DEFAULT_LOCAL_FILES_FOLDER_ID

  if (showingDefaultFolder) {
    return {
      kbId: defaultFolderKbId,
      storagePath: knowledgeFolderPath,
      defaultImportPath: knowledgeFolderPath,
      ready: Boolean(defaultFolderKbId && knowledgeFolderPath),
      vectorized: true,
    }
  }

  if (showingDefaultNetworkFolder) {
    return {
      kbId: defaultNetworkFolderKbId,
      storagePath: networkKnowledgeFolderPath,
      defaultImportPath: networkKnowledgeFolderPath,
      ready: Boolean(defaultNetworkFolderKbId && networkKnowledgeFolderPath),
      vectorized: true,
    }
  }

  if (showingDefaultLocalFilesFolder) {
    return {
      kbId: defaultLocalFilesKbId,
      storagePath: localFilesFolderPath,
      defaultImportPath: localFilesFolderPath,
      ready: Boolean(defaultLocalFilesKbId && localFilesFolderPath),
      vectorized: false,
    }
  }

  if (activeKbId && activeKbName) {
    const baseFolder =
      section === 'network'
        ? networkKnowledgeFolderPath
        : section === 'local-files'
          ? localFilesFolderPath
          : knowledgeFolderPath
    const storagePath = buildStoragePathForKb(baseFolder ?? null, activeKbName)
    return {
      kbId: activeKbId,
      storagePath,
      defaultImportPath: storagePath ?? baseFolder,
      ready: Boolean(storagePath),
      vectorized: activeKbKind !== 'local_files',
    }
  }

  return {
    kbId: null,
    storagePath: null,
    defaultImportPath: null,
    ready: false,
    vectorized: true,
  }
}
