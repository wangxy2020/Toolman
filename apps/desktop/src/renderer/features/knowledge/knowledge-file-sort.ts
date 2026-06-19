import type { KnowledgeFilePanelItem } from './KnowledgeBaseFilePanel'

export type KnowledgeFileSortField = 'createdAt' | 'size' | 'name'

export const KNOWLEDGE_FILE_SORT_OPTIONS: Array<{ id: KnowledgeFileSortField; label: string }> = [
  { id: 'createdAt', label: '创建时间' },
  { id: 'size', label: '大小' },
  { id: 'name', label: '文件名' },
]

export function sortKnowledgeFilePanelItems(
  items: KnowledgeFilePanelItem[],
  field: KnowledgeFileSortField,
  ascending: boolean,
): KnowledgeFilePanelItem[] {
  const sorted = [...items].sort((left, right) => {
    let compare = 0

    if (field === 'createdAt') {
      compare = left.createdAt - right.createdAt
    } else if (field === 'size') {
      compare = (left.sizeBytes ?? 0) - (right.sizeBytes ?? 0)
    } else {
      compare = left.title.localeCompare(right.title, 'zh-CN', { sensitivity: 'base' })
    }

    if (compare === 0) {
      compare = left.title.localeCompare(right.title, 'zh-CN', { sensitivity: 'base' })
    }

    return ascending ? compare : -compare
  })

  return sorted
}
