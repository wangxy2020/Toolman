import type { TranslateFn } from '../../i18n/I18nProvider'

export type CommunityListSortField = 'createdAt' | 'size' | 'name'

export function getCommunityListSortOptions(
  t: TranslateFn,
): Array<{ id: CommunityListSortField; label: string }> {
  return [
    { id: 'createdAt', label: t('communityPage.sort.createdAt') },
    { id: 'size', label: t('communityPage.sort.size') },
    { id: 'name', label: t('communityPage.sort.name') },
  ]
}

export interface CommunityListSortableItem {
  id: string
  title: string
  createdAt: number
  sizeBytes: number
}

export function sortCommunityListItems<T extends CommunityListSortableItem>(
  items: T[],
  field: CommunityListSortField,
  ascending: boolean,
): T[] {
  const sorted = [...items].sort((left, right) => {
    let compare = 0

    if (field === 'createdAt') {
      compare = left.createdAt - right.createdAt
    } else if (field === 'size') {
      compare = left.sizeBytes - right.sizeBytes
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
