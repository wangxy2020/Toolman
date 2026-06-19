import type { Workspace } from '@toolman/shared'
import type { SystemPaths } from './useSystemPaths'

const FOLDER_BASENAME_ZH: Record<string, string> = {
  Desktop: '桌面',
  Documents: '文稿',
  Downloads: '下载',
  Pictures: '图片',
  Music: '音乐',
  Movies: '影片',
  Applications: '应用程序',
  Library: '资源库',
  Public: '公共',
  Recents: '最近使用',
  Shared: '共享',
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

function localizeBasename(name: string): string {
  return FOLDER_BASENAME_ZH[name] ?? name
}

export function getWorkspaceFolderPath(
  workspace: Workspace | null,
  systemPaths?: SystemPaths | null,
): string | null {
  if (workspace) {
    const folderPath = workspace.settings.folderPath
    if (typeof folderPath === 'string' && folderPath.length > 0) {
      return folderPath
    }
  }

  return systemPaths?.documents ?? null
}

export function getFolderDisplayName(path: string, systemPaths?: SystemPaths | null): string {
  if (!path) return ''

  const normalized = normalizePath(path)

  if (systemPaths) {
    const knownFolders: Array<{ path: string; label: string }> = [
      { path: systemPaths.home, label: '个人' },
      { path: systemPaths.desktop, label: '桌面' },
      { path: systemPaths.documents, label: '文稿' },
      { path: systemPaths.downloads, label: '下载' },
    ]

    for (const folder of knownFolders) {
      const known = normalizePath(folder.path)
      if (normalized === known) return folder.label
      if (normalized.startsWith(`${known}/`)) {
        const suffix = normalized.slice(known.length + 1)
        return `${folder.label}/${suffix}`
      }
    }
  }

  const parts = path.split(/[/\\]/).filter(Boolean)
  const basename = parts[parts.length - 1] ?? path
  return localizeBasename(basename)
}

export function getWorkspaceFolderLabel(
  workspace: Workspace | null,
  systemPaths?: SystemPaths | null,
): string {
  if (!workspace) return '未选择工作区'

  const folderPath = getWorkspaceFolderPath(workspace, systemPaths)
  if (folderPath) {
    return getFolderDisplayName(folderPath, systemPaths)
  }

  return workspace.name
}

export function getEffectiveWorkingDirectory(
  assistantWorkingDirectory: string | undefined,
  workspace: Workspace | null,
  systemPaths?: SystemPaths | null,
): string {
  if (assistantWorkingDirectory?.trim()) return assistantWorkingDirectory.trim()
  return getWorkspaceFolderPath(workspace, systemPaths) ?? ''
}
