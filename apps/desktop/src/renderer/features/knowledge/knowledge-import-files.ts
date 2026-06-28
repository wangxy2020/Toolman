import { IpcChannel, type KnowledgeBase, type KnowledgeFolderKind } from '@toolman/shared'
import { buildKnowledgeBasePath, getPathBasename } from './knowledge-path-utils'
import {
  DEFAULT_KNOWLEDGE_FOLDER_ID,
  DEFAULT_LOCAL_FILES_FOLDER_ID,
  DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID,
  LEGACY_SYSTEM_DEFAULT_LOCAL_FILES_KB_NAME,
  LEGACY_SYSTEM_DEFAULT_NETWORK_FOLDER_KB_NAME,
  SYSTEM_DEFAULT_FOLDER_KB_NAME,
  type KnowledgeSidebarSection,
} from './knowledge-sidebar-types'

type DefaultFolderKnowledgeKind = Exclude<KnowledgeFolderKind, 'shared'>

export type { DefaultFolderKnowledgeKind }

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

interface ImportTarget {
  kbId: string | null
  storagePath: string | null
  defaultImportPath: string | null
  ready: boolean
  vectorized: boolean
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

export function buildStoragePathForKb(
  baseFolder: string | null,
  kbName: string,
): string | null {
  if (!baseFolder) return null
  const path = buildKnowledgeBasePath(baseFolder, kbName)
  return path || null
}

/** 从默认知识库的 storage 路径还原 section 根目录（去掉末尾「默认文件夹」等） */
export function resolveKnowledgeRootFromDefaultStorage(
  storagePath: string | null,
): string | null {
  if (!storagePath) return null

  let normalized = storagePath.replace(/[/\\]+$/, '')
  const legacySegments = [
    SYSTEM_DEFAULT_FOLDER_KB_NAME,
    LEGACY_SYSTEM_DEFAULT_NETWORK_FOLDER_KB_NAME,
    LEGACY_SYSTEM_DEFAULT_LOCAL_FILES_KB_NAME,
  ]

  for (const segment of legacySegments) {
    const unixSuffix = `/${segment}`
    const winSuffix = `\\${segment}`
    if (normalized.endsWith(unixSuffix)) {
      normalized = normalized.slice(0, -unixSuffix.length)
      break
    }
    if (normalized.endsWith(winSuffix)) {
      normalized = normalized.slice(0, -winSuffix.length)
      break
    }
  }

  return normalized || null
}

export function resolveKnowledgeSectionRoots(options: {
  knowledgeFolderPath: string | null
  networkKnowledgeFolderPath: string | null
  localFilesFolderPath: string | null
  localDefaultKbStoragePath?: string | null
  networkDefaultKbStoragePath?: string | null
  localFilesDefaultKbStoragePath?: string | null
}): {
  local: string | null
  network: string | null
  localFiles: string | null
} {
  return {
    local:
      options.knowledgeFolderPath ??
      resolveKnowledgeRootFromDefaultStorage(options.localDefaultKbStoragePath ?? null),
    network:
      options.networkKnowledgeFolderPath ??
      resolveKnowledgeRootFromDefaultStorage(options.networkDefaultKbStoragePath ?? null),
    localFiles:
      options.localFilesFolderPath ??
      resolveKnowledgeRootFromDefaultStorage(options.localFilesDefaultKbStoragePath ?? null),
  }
}

export function resolveDefaultKbStoragePath(rootFolder: string | null): string | null {
  return buildStoragePathForKb(rootFolder, SYSTEM_DEFAULT_FOLDER_KB_NAME)
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
    const storagePath = buildStoragePathForKb(
      knowledgeFolderPath,
      SYSTEM_DEFAULT_FOLDER_KB_NAME,
    )
    return {
      kbId: defaultFolderKbId,
      storagePath,
      defaultImportPath: storagePath,
      ready: Boolean(defaultFolderKbId && storagePath),
      vectorized: true,
    }
  }

  if (showingDefaultNetworkFolder) {
    const storagePath = buildStoragePathForKb(
      networkKnowledgeFolderPath,
      SYSTEM_DEFAULT_FOLDER_KB_NAME,
    )
    return {
      kbId: defaultNetworkFolderKbId,
      storagePath,
      defaultImportPath: storagePath,
      ready: Boolean(defaultNetworkFolderKbId && storagePath),
      vectorized: true,
    }
  }

  if (showingDefaultLocalFilesFolder) {
    const storagePath = buildStoragePathForKb(
      localFilesFolderPath,
      SYSTEM_DEFAULT_FOLDER_KB_NAME,
    )
    return {
      kbId: defaultLocalFilesKbId,
      storagePath,
      defaultImportPath: storagePath,
      ready: Boolean(defaultLocalFilesKbId && storagePath),
      vectorized: false,
    }
  }

  if (section === 'shared' && activeKbId && activeKbKind === 'shared') {
    return {
      kbId: activeKbId,
      storagePath: null,
      defaultImportPath: null,
      ready: true,
      vectorized: true,
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
