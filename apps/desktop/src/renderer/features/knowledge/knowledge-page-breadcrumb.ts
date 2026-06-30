import {
  DEFAULT_KNOWLEDGE_FOLDER_ID,
  DEFAULT_LOCAL_FILES_FOLDER_ID,
  DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID,
  FILE_REGISTRY_TOOL_ID,
  SYSTEM_DEFAULT_FOLDER_KB_NAME,
  type KnowledgeSidebarSection,
} from './knowledge-sidebar-types'
import type { KnowledgeFilePanelItem } from './KnowledgeBaseFilePanel'

export function getDeleteFileMessageSuffix(section: KnowledgeSidebarSection): string {
  return section === 'network'
    ? '删除后无法恢复。'
    : '程序记录与知识库文件夹中的副本都会删除，且无法恢复。'
}

export function buildDeleteConfirmMessage(
  ids: string[],
  panelDocuments: KnowledgeFilePanelItem[],
  section: KnowledgeSidebarSection,
): string {
  const suffix = getDeleteFileMessageSuffix(section)
  if (ids.length === 1) {
    const title = panelDocuments.find((item) => item.id === ids[0])?.title ?? '该文件'
    return `确定删除「${title}」？${suffix}`
  }
  return `确定删除选中的 ${ids.length} 个文件？${suffix}`
}

export interface BreadcrumbParams {
  section: KnowledgeSidebarSection
  activeId: string | null
  active: { name: string } | null
  fileRegistryLabel: string
  fileDedupLabel: string
}

export function resolveBreadcrumbItemName({
  section,
  activeId,
  active,
  fileRegistryLabel,
  fileDedupLabel,
}: BreadcrumbParams): string | undefined {
  if (section === 'local') {
    return activeId === DEFAULT_KNOWLEDGE_FOLDER_ID ? SYSTEM_DEFAULT_FOLDER_KB_NAME : active?.name
  }
  if (section === 'network') {
    return activeId === DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID
      ? SYSTEM_DEFAULT_FOLDER_KB_NAME
      : active?.name
  }
  if (section === 'local-files') {
    return activeId === DEFAULT_LOCAL_FILES_FOLDER_ID
      ? SYSTEM_DEFAULT_FOLDER_KB_NAME
      : active?.name
  }
  if (section === 'shared') {
    return active?.name
  }
  if (section === 'file-tools') {
    if (activeId === FILE_REGISTRY_TOOL_ID) return fileRegistryLabel
    return fileDedupLabel
  }
  return undefined
}
