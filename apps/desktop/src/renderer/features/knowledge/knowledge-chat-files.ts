import type { KnowledgeFilePanelItem } from './KnowledgeBaseFilePanel'

export function isChatAttachableKnowledgeFile(item: KnowledgeFilePanelItem): boolean {
  const path = item.absolutePath?.trim()
  if (!path) return false
  return !/^https?:\/\//i.test(path)
}

/** 仅使用已选中的、可附加的本地文件 */
export function resolveKnowledgeFilesForChat(
  items: KnowledgeFilePanelItem[],
  selectedIds: Set<string>,
): KnowledgeFilePanelItem[] {
  if (selectedIds.size === 0) return []
  return items
    .filter((item) => selectedIds.has(item.id))
    .filter(isChatAttachableKnowledgeFile)
}

export function buildChatWithKnowledgeFilesDraft(fileNames: string[]): string {
  if (fileNames.length === 1) {
    return `请阅读附件「${fileNames[0]}」并回答我的问题。`
  }
  return `请阅读以下 ${fileNames.length} 个附件并回答我的问题。`
}
