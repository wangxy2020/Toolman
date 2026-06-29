import type { KnowledgeBase } from '@toolman/shared'
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

export interface ImportTarget {
  kbId: string | null
  storagePath: string | null
  defaultImportPath: string | null
  ready: boolean
  vectorized: boolean
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
