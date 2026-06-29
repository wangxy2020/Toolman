import { buildKnowledgeBasePath, getPathBasename, stripFileExtension } from './knowledge-path-utils'
import { deriveKnowledgeBaseNameFromUrl } from './knowledge-url-utils'
import type { KnowledgeSourcePick } from './knowledge-create-types'

export function deriveKnowledgeBaseName(sourcePick: KnowledgeSourcePick): string | null {
  switch (sourcePick.mode) {
    case 'url':
      return deriveKnowledgeBaseNameFromUrl(sourcePick.url)
    case 'folder-empty':
    case 'folder-with-files':
      return getPathBasename(sourcePick.folderPath)
    case 'files': {
      if (sourcePick.filePaths.length === 1) {
        return stripFileExtension(getPathBasename(sourcePick.filePaths[0]))
      }
      const parentName = getPathBasename(sourcePick.parentPath)
      if (parentName) return parentName
      return stripFileExtension(getPathBasename(sourcePick.filePaths[0]))
    }
    default:
      return null
  }
}

export function resolveKnowledgeBaseName(name: string, sourcePick: KnowledgeSourcePick): string | null {
  const trimmed = name.trim()
  if (trimmed) return trimmed
  return deriveKnowledgeBaseName(sourcePick)
}

export function resolveKbPath(name: string, baseFolderPath: string | null): string {
  const builtPath = buildKnowledgeBasePath(baseFolderPath, name)
  if (builtPath) return builtPath
  return baseFolderPath ?? ''
}

export function resolveDisplayPath(
  name: string,
  baseFolderPath: string | null,
  sourcePick: KnowledgeSourcePick,
): string {
  switch (sourcePick.mode) {
    case 'folder-with-files':
      return sourcePick.folderPath
    case 'folder-empty':
      return resolveKbPath(name, baseFolderPath) || baseFolderPath || ''
    case 'files':
      return sourcePick.parentPath
    default:
      return resolveKbPath(name, baseFolderPath) || baseFolderPath || ''
  }
}

export function resolveBaseFolderPath(
  kind: 'local' | 'network' | 'local_files' | 'shared',
  defaultLocalFolderPath: string | null,
  defaultNetworkFolderPath: string | null,
  defaultLocalFilesFolderPath: string | null,
): string | null {
  if (kind === 'network') return defaultNetworkFolderPath
  if (kind === 'local_files') return defaultLocalFilesFolderPath
  return defaultLocalFolderPath
}
