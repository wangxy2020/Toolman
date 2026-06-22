import type { KnowledgeFilePanelItem } from '../knowledge/KnowledgeBaseFilePanel'

export interface GroupKnowledgePanelItem extends KnowledgeFilePanelItem {
  /** Local saved copy id in the member's shared knowledge folder KB. */
  savedDocumentId?: string | null
}

export function getGroupKnowledgeStatusLabel(
  item: GroupKnowledgePanelItem,
  isResourceOwner: boolean,
): string {
  const saved = Boolean(item.savedDocumentId)
  const status = item.status ?? 'ready'

  if (isResourceOwner) {
    if (status === 'failed') return '同步失败'
    return '已在群组共享'
  }

  if (saved) return '已保存至共享知识库'
  if (status === 'failed') return '同步失败'
  return '未保存至共享知识库'
}
