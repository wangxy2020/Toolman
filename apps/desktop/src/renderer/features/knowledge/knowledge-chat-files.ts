import { isTranslationDocumentPath } from '../translation/translation-document-utils'
import type { KnowledgeFilePanelItem } from './KnowledgeBaseFilePanel'

export function isChatAttachableKnowledgeFile(item: KnowledgeFilePanelItem): boolean {
  const path = item.absolutePath?.trim()
  if (!path) return false
  return !/^https?:\/\//i.test(path)
}

export function isTranslationOpenableKnowledgeFile(item: KnowledgeFilePanelItem): boolean {
  if (!isChatAttachableKnowledgeFile(item)) return false
  return isTranslationDocumentPath(item.absolutePath!.trim())
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

/** 已选中且翻译页支持打开的本地文件（PDF / Word / Excel） */
export function resolveKnowledgeFilesForTranslation(
  items: KnowledgeFilePanelItem[],
  selectedIds: Set<string>,
): KnowledgeFilePanelItem[] {
  if (selectedIds.size === 0) return []
  return items
    .filter((item) => selectedIds.has(item.id))
    .filter(isTranslationOpenableKnowledgeFile)
}

export function buildChatWithKnowledgeFilesDraft(fileNames: string[]): string {
  if (fileNames.length === 1) {
    return `请结合知识库检索与附件「${fileNames[0]}」回答我的问题。`
  }
  return `请结合知识库检索与以下 ${fileNames.length} 个附件回答我的问题。`
}
