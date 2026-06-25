import type { KnowledgeFilePanelItem } from './KnowledgeBaseFilePanel'
import type { TranslateFn } from '../../i18n/useI18n'

export type KnowledgeFileSortField = 'createdAt' | 'size' | 'name'

export function getKnowledgeFileSortOptions(
  t: TranslateFn,
): Array<{ id: KnowledgeFileSortField; label: string }> {
  return [
    { id: 'createdAt', label: t('knowledgePage.sort.createdAt') },
    { id: 'size', label: t('knowledgePage.sort.size') },
    { id: 'name', label: t('knowledgePage.sort.fileName') },
  ]
}

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
