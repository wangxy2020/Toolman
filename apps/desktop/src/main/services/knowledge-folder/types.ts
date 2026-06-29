import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import {
  getDefaultKnowledgeFolderPath,
  getDefaultLocalFilesFolderPath,
  getDefaultNetworkKnowledgeFolderPath,
  getDefaultSharedKnowledgeFolderPath,
  getDefaultWorkspaceFolderPath,
} from '../toolman-user-documents.service'

export type WorkspaceFolderSettingKey =
  | 'folderPath'
  | 'knowledgeFolderPath'
  | 'networkKnowledgeFolderPath'
  | 'sharedKnowledgeFolderPath'
  | 'localFilesFolderPath'

export const WORKSPACE_FOLDER_SETTINGS: Array<{
  key: WorkspaceFolderSettingKey
  subfolder: string
  defaultPath: () => string
}> = [
  { key: 'folderPath', subfolder: '工作区', defaultPath: getDefaultWorkspaceFolderPath },
  { key: 'knowledgeFolderPath', subfolder: '本地知识库', defaultPath: getDefaultKnowledgeFolderPath },
  {
    key: 'networkKnowledgeFolderPath',
    subfolder: '网络知识库',
    defaultPath: getDefaultNetworkKnowledgeFolderPath,
  },
  {
    key: 'sharedKnowledgeFolderPath',
    subfolder: '共享知识库',
    defaultPath: getDefaultSharedKnowledgeFolderPath,
  },
  { key: 'localFilesFolderPath', subfolder: '本地文件', defaultPath: getDefaultLocalFilesFolderPath },
]

export function readWorkspaceSettingString(
  settings: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = settings[key]
  return typeof value === 'string' ? value : undefined
}

function expandHomePrefix(path: string): string {
  const trimmed = path.trim()
  if (trimmed === '~') return homedir()
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return join(homedir(), trimmed.slice(2))
  }
  return trimmed
}

/** Resolve user-configured folder paths to absolute paths under the home directory. */
export function resolveStoredFolderPath(
  stored: string | undefined,
  defaultPath: () => string,
): string {
  const raw =
    typeof stored === 'string' && stored.trim().length > 0
      ? expandHomePrefix(stored)
      : defaultPath()
  if (!isAbsolute(raw)) {
    return resolve(homedir(), raw)
  }
  return resolve(raw)
}
