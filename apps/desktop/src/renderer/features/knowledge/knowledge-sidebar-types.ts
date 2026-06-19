import type { KnowledgeBaseKind } from '@toolman/shared'

export type KnowledgeSidebarSection = 'local' | 'network' | 'local-files' | 'file-tools'

export const DEFAULT_KNOWLEDGE_FOLDER_ID = '__default_knowledge_folder__'
export const DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID = '__default_network_knowledge_folder__'
export const DEFAULT_LOCAL_FILES_FOLDER_ID = '__default_local_files_folder__'
export const FILE_REGISTRY_TOOL_ID = '__file_registry_tool__'
export const FILE_DEDUP_TOOL_ID = '__file_dedup_tool__'

export const SYSTEM_DEFAULT_FOLDER_KB_NAME = '默认文件夹'
export const SYSTEM_DEFAULT_NETWORK_FOLDER_KB_NAME = '默认网络文件夹'
export const SYSTEM_DEFAULT_LOCAL_FILES_KB_NAME = '默认本地文件'

export const SYSTEM_DEFAULT_FOLDER_KB_NAMES = new Set([
  SYSTEM_DEFAULT_FOLDER_KB_NAME,
  SYSTEM_DEFAULT_NETWORK_FOLDER_KB_NAME,
  SYSTEM_DEFAULT_LOCAL_FILES_KB_NAME,
])

export const KNOWLEDGE_VIRTUAL_FOLDER_IDS = new Set([
  DEFAULT_KNOWLEDGE_FOLDER_ID,
  DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID,
  DEFAULT_LOCAL_FILES_FOLDER_ID,
  FILE_REGISTRY_TOOL_ID,
  FILE_DEDUP_TOOL_ID,
])

export function isKnowledgeVirtualFolderId(id: string | null): boolean {
  return id != null && KNOWLEDGE_VIRTUAL_FOLDER_IDS.has(id)
}

export function isDeletableKnowledgeBase(name: string): boolean {
  return !SYSTEM_DEFAULT_FOLDER_KB_NAMES.has(name)
}

export const KNOWLEDGE_SIDEBAR_SECTIONS: Array<{
  id: KnowledgeSidebarSection
  label: string
}> = [
  { id: 'local', label: '本地知识库' },
  { id: 'network', label: '网络知识库' },
  { id: 'local-files', label: '本地文件' },
  { id: 'file-tools', label: '本地文件工具' },
]

export function knowledgeSectionForKind(kind: KnowledgeBaseKind): KnowledgeSidebarSection {
  if (kind === 'network') return 'network'
  if (kind === 'local_files') return 'local-files'
  return 'local'
}
